import 'dotenv/config';
import * as path from 'path';
import * as fs from 'fs';
import { MatrixClient, Appservice } from 'matrix-bot-sdk';
import { createMatrixClient, createAppserviceClient, isAppserviceMode, sendMessage } from './matrixClient';
import { handleSetupCommand, handleWizardReply, isInSetup } from './setup/wizard';
import { handleInboxMessage } from './handlers/inbox';
import { handleLocationEvent } from './handlers/location';
import { handleProjectMessage } from './handlers/project';
import { getDb, runMigrations } from '../db/migrate';
import { getProjectByRoomId } from '../db/queries/projects';
import { startDailyCron } from '../cron/daily';
import { startWeeklyCron } from '../cron/weekly';
import { startEnrichmentCron } from '../cron/enrich';
import { loadConfigYaml, saveConfigYaml, env } from '../config';
import { listAnthropicModels, getLatestModelId, formatModelList } from '../ai/models';

// Ensure data directory exists for bot storage
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function setupEventHandler(
  emitter: MatrixClient | Appservice,
  client: MatrixClient,
  startupTs: number,
): void {
  const db = getDb();

  emitter.on('room.message', async (roomId: string, event: Record<string, unknown>) => {
    // Skip events that predate this bot session (replayed history)
    const eventTs = event.origin_server_ts as number | undefined;
    if (eventTs !== undefined && eventTs < startupTs) return;

    console.log(`📨 room.message from ${event.sender} in ${roomId}: ${JSON.stringify((event.content as Record<string,unknown>)?.body ?? '').slice(0, 80)}`);
    // Ignore bot's own messages
    if ((event.sender as string) === env.MATRIX_BOT_USER_ID) return;

    const content = event.content as Record<string, unknown>;
    const msgtype = content?.msgtype as string;
    const userId = event.sender as string;
    const eventId = event.event_id as string;

    // Handle location events
    if (msgtype === 'm.location') {
      const geoUri = (content.geo_uri as string) || (content['org.matrix.msc3488.location'] as Record<string, string>)?.uri;
      if (geoUri) {
        await handleLocationEvent(client, db, roomId, userId, geoUri);
      }
      return;
    }

    // Only handle text messages from here
    if (msgtype !== 'm.text') return;

    let text = (content.body as string)?.trim();
    if (!text) return;

    // Strip fallback quote prefix from thread replies.
    // Element adds "> <@user:server> ...\n\n" for clients that don't support threads.
    const relatesTo = content['m.relates_to'] as Record<string, unknown> | undefined;
    if (relatesTo?.rel_type === 'm.thread') {
      text = text.replace(/^(> <@[^>]+>[^\n]*\n)+\n*/, '').trim();
      if (!text) return;
    }

    // !help command — show available commands
    if (text === '!help') {
      const isAdmin = userId === env.ADMIN_MATRIX_ID;
      const cfg = loadConfigYaml();
      const currentModel = cfg.llm_model
        || (env.LLM_PROVIDER === 'bedrock' ? env.BEDROCK_MODEL_ID : env.ANTHROPIC_MODEL_ID);
      const lines = [
        '**Second Brain Bot**',
        '',
        '**Capture** — send any message to your inbox room and the bot will classify and store it:',
        '`task` `project` `event` `contact` `resource` `note` `shopping` `waiting_for` `someday_maybe` `area`',
        '',
        '**Location alerts** — share your live location in Element and get notified when you\'re near a store with pending shopping items.',
        '',
        '**Commands:**',
        '| Command | Description |',
        '|---|---|',
        '| `!help` | Show this help message |',
        '| `!status` | Show bot status and configuration |',
      ];
      if (isAdmin) {
        lines.push(
          '| `!setup` | Run the first-time setup wizard |',
          '| `!setup force` | Re-run the setup wizard (overwrites config) |',
          '| `!model` | Show current LLM model |',
          '| `!model list` | Show all available Bedrock models |',
          '| `!model latest` | Switch to the latest Sonnet |',
          '| `!model latest haiku` | Switch to the latest Haiku (cheaper) |',
          '| `!model latest opus` | Switch to the latest Opus (most capable) |',
          '| `!model <id>` | Switch to a specific model ID |',
          '| `!model reset` | Clear override, revert to .env default |',
          '',
          '**Current config:**',
          `- LLM provider: \`${env.LLM_PROVIDER}\``,
          `- Model: \`${currentModel}\``,
          `- Users: ${cfg.users.length > 0 ? cfg.users.join(', ') : '(none — run !setup)'}`,
          `- Alert radius: ${env.ALERT_RADIUS_METERS}m`,
          `- Confidence threshold: ${env.CLASSIFICATION_CONFIDENCE_THRESHOLD}`,
        );
      }
      await sendMessage(client, roomId, lines.join('\n'));
      return;
    }

    // !status command — quick status check
    if (text === '!status') {
      const cfg = loadConfigYaml();
      const currentModel = cfg.llm_model
        || (env.LLM_PROVIDER === 'bedrock' ? env.BEDROCK_MODEL_ID : env.ANTHROPIC_MODEL_ID);
      const uptime = Math.floor((Date.now() - startupTs) / 1000);
      const hours = Math.floor(uptime / 3600);
      const mins = Math.floor((uptime % 3600) / 60);
      const lines = [
        '**Bot Status**',
        `- Uptime: ${hours}h ${mins}m`,
        `- LLM: \`${env.LLM_PROVIDER}\` / \`${currentModel}\``,
        `- Users: ${cfg.users.length > 0 ? cfg.users.join(', ') : '(none)'}`,
        `- Space: ${cfg.space.name || '(not configured)'}`,
      ];
      await sendMessage(client, roomId, lines.join('\n'));
      return;
    }

    // !setup command — works in any room
    if (text === '!setup' || text === '!setup force') {
      await handleSetupCommand(client, roomId, userId, text === '!setup force');
      return;
    }

    // !model command — admin can switch LLM model at runtime
    if (text.startsWith('!model')) {
      if (userId !== env.ADMIN_MATRIX_ID) {
        await sendMessage(client, roomId, '⛔ Only the admin can change the model.');
        return;
      }
      const arg = text.replace('!model', '').trim();

      // !model (no args) — show current model
      if (!arg) {
        const cfg = loadConfigYaml();
        const current = cfg.llm_model
          || (env.LLM_PROVIDER === 'bedrock' ? env.BEDROCK_MODEL_ID : env.ANTHROPIC_MODEL_ID);
        const source = cfg.llm_model ? 'config' : 'env default';
        await sendMessage(client, roomId,
          `Current model: \`${current}\` (${source})\n\n` +
          'Commands: `!model list` | `!model latest` | `!model latest haiku` | `!model <id>`');
        return;
      }

      // !model list — show available models from Bedrock
      if (arg === 'list') {
        if (env.LLM_PROVIDER !== 'bedrock') {
          await sendMessage(client, roomId, 'Model discovery is only available with `LLM_PROVIDER=bedrock`.');
          return;
        }
        try {
          const cfg = loadConfigYaml();
          const currentModel = cfg.llm_model || env.BEDROCK_MODEL_ID;
          const models = await listAnthropicModels(true);
          await sendMessage(client, roomId, formatModelList(models, currentModel));
        } catch (err) {
          await sendMessage(client, roomId, `Failed to list models: ${(err as Error).message}`);
        }
        return;
      }

      // !model latest [tier] — auto-select the latest model
      if (arg === 'latest' || arg.startsWith('latest ')) {
        if (env.LLM_PROVIDER !== 'bedrock') {
          await sendMessage(client, roomId, 'Model discovery is only available with `LLM_PROVIDER=bedrock`.');
          return;
        }
        const tier = arg.split(' ')[1] as 'opus' | 'sonnet' | 'haiku' | undefined;
        const validTiers = ['opus', 'sonnet', 'haiku'];
        if (tier && !validTiers.includes(tier)) {
          await sendMessage(client, roomId, `Invalid tier \`${tier}\`. Choose: \`opus\`, \`sonnet\`, or \`haiku\`.`);
          return;
        }
        try {
          const latestId = await getLatestModelId(tier || 'sonnet');
          if (!latestId) {
            await sendMessage(client, roomId, 'No active models found. Check your Bedrock model access.');
            return;
          }
          const cfg = loadConfigYaml();
          cfg.llm_model = latestId;
          saveConfigYaml(cfg);
          await sendMessage(client, roomId, `✅ Switched to latest ${tier || 'sonnet'}: \`${latestId}\``);
        } catch (err) {
          await sendMessage(client, roomId, `Failed to discover models: ${(err as Error).message}`);
        }
        return;
      }

      // !model reset — clear override, revert to env default
      if (arg === 'reset') {
        const cfg = loadConfigYaml();
        delete cfg.llm_model;
        saveConfigYaml(cfg);
        const fallback = env.LLM_PROVIDER === 'bedrock' ? env.BEDROCK_MODEL_ID : env.ANTHROPIC_MODEL_ID;
        await sendMessage(client, roomId, `✅ Model override cleared. Using env default: \`${fallback}\``);
        return;
      }

      // !model <specific-id> — set explicit model
      const cfg = loadConfigYaml();
      cfg.llm_model = arg;
      saveConfigYaml(cfg);
      await sendMessage(client, roomId, `✅ Model switched to \`${arg}\`. Takes effect on next message.`);
      return;
    }

    // If user is in setup wizard flow, route to wizard
    if (isInSetup(userId)) {
      await handleWizardReply(client, roomId, userId, text);
      return;
    }

    // Route to inbox handler (reload config fresh so wizard changes are picked up)
    const inboxRooms = loadConfigYaml().rooms.inbox;
    if (Object.values(inboxRooms).includes(roomId)) {
      await handleInboxMessage(client, db, roomId, eventId, userId, text);
      return;
    }

    // Route to project handler
    const project = await getProjectByRoomId(db, roomId);
    if (project) {
      await handleProjectMessage(client, db, roomId, eventId, userId, text);
      return;
    }
  });
}

function setupCronJobs(): void {
  const db = getDb();
  const digestRoom = loadConfigYaml().rooms.digest;
  const client = require('./matrixClient').getMatrixClient();

  if (digestRoom) {
    startDailyCron(db, async (msg) => { await sendMessage(client, digestRoom, msg); });
    startWeeklyCron(db, async (msg) => { await sendMessage(client, digestRoom, msg); });
  }
  startEnrichmentCron(db);
}

async function main(): Promise<void> {
  console.log('🧠 Matrix Second Brain starting...');

  // Run DB migrations
  await runMigrations();

  // Record startup time — used to skip historical events replayed on reconnect
  const startupTs = Date.now();

  if (isAppserviceMode()) {
    // --- Appservice mode: homeserver pushes events to us via HTTP ---
    const { client, appservice } = createAppserviceClient();

    setupEventHandler(appservice, client, startupTs);
    setupCronJobs();

    await appservice.begin();
    console.log('✅ Matrix Second Brain is running! (appservice mode)');
    console.log(`   Bot: ${env.MATRIX_BOT_USER_ID}`);
    console.log(`   Admin: ${env.ADMIN_MATRIX_ID}`);
    console.log(`   LLM: ${env.LLM_PROVIDER}`);
    console.log(`   Listening on: ${env.APPSERVICE_BIND_ADDRESS}:${env.APPSERVICE_PORT}`);
  } else {
    // --- Client mode: bot polls /sync (original behavior) ---
    const client = createMatrixClient();

    setupEventHandler(client, client, startupTs);
    setupCronJobs();

    await client.start();
    console.log('✅ Matrix Second Brain is running!');
    console.log(`   Bot: ${env.MATRIX_BOT_USER_ID}`);
    console.log(`   Admin: ${env.ADMIN_MATRIX_ID}`);
    console.log(`   LLM: ${env.LLM_PROVIDER}`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
