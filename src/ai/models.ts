import { BedrockClient, ListFoundationModelsCommand, FoundationModelSummary } from '@aws-sdk/client-bedrock';
import { env } from '../config';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ModelInfo {
  modelId: string;
  name: string;
  tier: 'opus' | 'sonnet' | 'haiku' | 'unknown';
  inputModalities: string[];
  outputModalities: string[];
  streaming: boolean;
  active: boolean;
}

// ─── Cache ──────────────────────────────────────────────────────────────────

let cachedModels: ModelInfo[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ─── Tier Detection ─────────────────────────────────────────────────────────

function detectTier(modelId: string, modelName: string): ModelInfo['tier'] {
  const id = modelId.toLowerCase();
  const name = modelName.toLowerCase();
  if (id.includes('opus') || name.includes('opus')) return 'opus';
  if (id.includes('sonnet') || name.includes('sonnet')) return 'sonnet';
  if (id.includes('haiku') || name.includes('haiku')) return 'haiku';
  return 'unknown';
}

// ─── Version Sorting ────────────────────────────────────────────────────────

// Extract a sortable version key from the model ID.
// IDs look like "anthropic.claude-sonnet-4-5-20250929-v1:0" or "anthropic.claude-opus-4-6-v1".
// We extract the numeric version parts and date for sorting so newer models sort last.
function sortKey(modelId: string): string {
  // Pull out all digit groups — the date (YYYYMMDD) and version numbers
  const digits = modelId.match(/\d+/g) || [];
  // Pad each group to 10 chars so lexicographic sort works numerically
  return digits.map(d => d.padStart(10, '0')).join('-');
}

// ─── Region Prefix ──────────────────────────────────────────────────────────

// Bedrock ListFoundationModels returns base IDs (e.g. "anthropic.claude-sonnet-4-5-20250929-v1:0")
// but InvokeModel requires a cross-region inference profile ID (e.g. "us.anthropic.claude-...").
// Derive the region prefix from AWS_REGION.
function getRegionPrefix(): string {
  const region = env.AWS_REGION;
  if (region.startsWith('us-')) return 'us';
  if (region.startsWith('eu-')) return 'eu';
  if (region.startsWith('ap-northeast-1')) return 'jp';
  if (region.startsWith('ap-')) return 'apac';
  return 'us'; // default
}

function toInferenceProfileId(baseModelId: string): string {
  // If it already has a region prefix, leave it alone
  if (/^(us|eu|jp|apac|global)\./.test(baseModelId)) return baseModelId;
  return `${getRegionPrefix()}.${baseModelId}`;
}

// ─── Discovery ──────────────────────────────────────────────────────────────

export async function listAnthropicModels(forceRefresh = false): Promise<ModelInfo[]> {
  if (!forceRefresh && cachedModels && (Date.now() - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedModels;
  }

  const client = new BedrockClient({ region: env.AWS_REGION });
  const command = new ListFoundationModelsCommand({ byProvider: 'Anthropic' });
  const response = await client.send(command);

  const models: ModelInfo[] = (response.modelSummaries || [])
    .filter((m: FoundationModelSummary) => m.modelId?.startsWith('anthropic.claude'))
    .map((m: FoundationModelSummary) => {
      const baseId = m.modelId!;
      return {
        modelId: toInferenceProfileId(baseId),
        name: m.modelName || baseId,
        tier: detectTier(baseId, m.modelName || ''),
        inputModalities: (m.inputModalities as string[]) || [],
        outputModalities: (m.outputModalities as string[]) || [],
        streaming: m.responseStreamingSupported ?? false,
        active: m.modelLifecycle?.status === 'ACTIVE',
      };
    })
    .sort((a: ModelInfo, b: ModelInfo) => sortKey(a.modelId).localeCompare(sortKey(b.modelId)));

  cachedModels = models;
  cacheTimestamp = Date.now();
  return models;
}

// ─── Latest Model Picker ────────────────────────────────────────────────────

export async function getLatestModelId(preferredTier: ModelInfo['tier'] = 'sonnet'): Promise<string | null> {
  try {
    const models = await listAnthropicModels();
    const active = models.filter(m => m.active);

    // Pick the latest model in the preferred tier
    const tierModels = active.filter(m => m.tier === preferredTier);
    if (tierModels.length > 0) {
      return tierModels[tierModels.length - 1].modelId;
    }

    // Fall back to any active model (prefer sonnet > haiku > opus)
    const fallbackOrder: ModelInfo['tier'][] = ['sonnet', 'haiku', 'opus'];
    for (const tier of fallbackOrder) {
      const fallback = active.filter(m => m.tier === tier);
      if (fallback.length > 0) return fallback[fallback.length - 1].modelId;
    }

    return null;
  } catch (err) {
    console.warn('Failed to discover Bedrock models:', err);
    return null;
  }
}

// ─── Formatting ─────────────────────────────────────────────────────────────

export function formatModelList(models: ModelInfo[], currentModelId: string): string {
  const lines: string[] = ['**Available Anthropic models on Bedrock:**', ''];

  const tiers: ModelInfo['tier'][] = ['opus', 'sonnet', 'haiku'];
  for (const tier of tiers) {
    const tierModels = models.filter(m => m.tier === tier);
    if (tierModels.length === 0) continue;

    lines.push(`**${tier.charAt(0).toUpperCase() + tier.slice(1)}**`);
    for (const m of tierModels) {
      const isCurrent = m.modelId === currentModelId;
      const status = m.active ? '' : ' (inactive)';
      const marker = isCurrent ? ' **<< current**' : '';
      lines.push(`- \`${m.modelId}\`${status}${marker}`);
    }
    lines.push('');
  }

  // Show unknown tier if any
  const unknownModels = models.filter(m => m.tier === 'unknown');
  if (unknownModels.length > 0) {
    lines.push('**Other**');
    for (const m of unknownModels) {
      const isCurrent = m.modelId === currentModelId;
      const status = m.active ? '' : ' (inactive)';
      const marker = isCurrent ? ' **<< current**' : '';
      lines.push(`- \`${m.modelId}\`${status}${marker}`);
    }
    lines.push('');
  }

  lines.push('Use `!model <model-id>` to switch, or `!model latest` for the newest Sonnet.');
  lines.push('Model IDs include the region prefix (e.g. `us.`) required by Bedrock InvokeModel.');
  return lines.join('\n');
}
