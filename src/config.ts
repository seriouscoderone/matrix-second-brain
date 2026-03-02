import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { z } from 'zod';

dotenv.config();

// ─── Environment schema ────────────────────────────────────────────────────

const EnvSchema = z.object({
  MATRIX_HOMESERVER_URL: z.string().url(),
  MATRIX_BOT_USER_ID: z.string().startsWith('@'),
  MATRIX_BOT_ACCESS_TOKEN: z.string().min(1),
  ADMIN_MATRIX_ID: z.string().startsWith('@'),

  DATABASE_URL: z.string().url(),

  LLM_PROVIDER: z.enum(['bedrock', 'anthropic', 'mock']).default('bedrock'),

  // Appservice mode (optional — if set, bot runs as a Matrix Application Service)
  APPSERVICE_REGISTRATION: z.string().optional(), // path to registration YAML
  APPSERVICE_PORT: z.coerce.number().default(9090),
  APPSERVICE_BIND_ADDRESS: z.string().default('0.0.0.0'),
  MATRIX_HOMESERVER_NAME: z.string().optional(), // e.g. "example.com" (federation name)

  // Bedrock — credentials come from EC2 instance profile, not env vars
  AWS_REGION: z.string().default('us-east-1'),
  BEDROCK_MODEL_ID: z.string().default('us.anthropic.claude-sonnet-4-5-20251001-v2:0'),

  // Direct Anthropic
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL_ID: z.string().default('claude-sonnet-4-6'),

  // Tuning
  CLASSIFICATION_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),
  ALERT_RADIUS_METERS: z.coerce.number().positive().default(500),
  LOCATION_COOLDOWN_MINUTES: z.coerce.number().positive().default(120),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    result.error.errors.forEach((e) => {
      console.error(`  ${e.path.join('.')}: ${e.message}`);
    });
    process.exit(1);
  }
  return result.data;
}

// ─── Config.yaml schema ────────────────────────────────────────────────────

const ConfigYamlSchema = z.object({
  space: z.object({
    id: z.string().default(''),
    name: z.string().default(''),
  }),
  rooms: z.object({
    digest: z.string().default(''),
    inbox: z.record(z.string()).default({}),
  }),
  users: z.array(z.string()).default([]),
  cron: z.object({
    daily_digest: z.string().default('0 8 * * *'),
    weekly_review: z.string().default('0 9 * * 1'),
    enrichment: z.string().default('0 */6 * * *'),
  }),
});

export type ConfigYaml = z.infer<typeof ConfigYamlSchema>;

const CONFIG_YAML_PATH = path.join(process.cwd(), 'config.yaml');

export function loadConfigYaml(): ConfigYaml {
  if (!fs.existsSync(CONFIG_YAML_PATH)) {
    return ConfigYamlSchema.parse({});
  }
  const raw = yaml.load(fs.readFileSync(CONFIG_YAML_PATH, 'utf8'));
  return ConfigYamlSchema.parse(raw);
}

export function saveConfigYaml(config: ConfigYaml): void {
  fs.writeFileSync(CONFIG_YAML_PATH, yaml.dump(config), 'utf8');
}

// ─── Singletons ────────────────────────────────────────────────────────────

export const env = loadEnv();
export const config = loadConfigYaml();
