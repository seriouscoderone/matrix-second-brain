#!/usr/bin/env ts-node
/**
 * generate-registration.ts — Generates a Matrix Application Service registration YAML.
 *
 * This is the "installable artifact" for the Second Brain bot. A homeserver admin:
 *   1. Runs this script to generate the registration file
 *   2. Copies it to their homeserver config directory
 *   3. Adds it to homeserver.yaml's app_service_config_files list
 *   4. Restarts the homeserver
 *
 * Usage:
 *   npx ts-node scripts/generate-registration.ts \
 *     --url http://localhost:9090 \
 *     --localpart secondbrain \
 *     --output registration.yaml
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

interface RegistrationArgs {
  url: string;
  localpart: string;
  output: string;
  id: string;
}

function parseArgs(): RegistrationArgs {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    parsed[key] = args[i + 1];
  }

  return {
    url: parsed.url || 'http://localhost:9090',
    localpart: parsed.localpart || 'secondbrain',
    output: parsed.output || 'registration.yaml',
    id: parsed.id || 'second-brain',
  };
}

function main(): void {
  const args = parseArgs();

  const registration = {
    id: args.id,
    url: args.url,
    as_token: generateToken(),
    hs_token: generateToken(),
    sender_localpart: args.localpart,
    namespaces: {
      users: [
        {
          exclusive: true,
          regex: `@${args.localpart}.*`,
        },
      ],
      rooms: [],
      aliases: [],
    },
    rate_limited: false,
  };

  const yamlContent = yaml.dump(registration, { lineWidth: -1 });
  fs.writeFileSync(args.output, yamlContent, 'utf8');

  console.log(`✓ Registration file written to: ${args.output}`);
  console.log();
  console.log('Next steps:');
  console.log(`  1. Copy ${args.output} to your homeserver config directory`);
  console.log('  2. Add to homeserver.yaml:');
  console.log('     app_service_config_files:');
  console.log(`       - /path/to/${args.output}`);
  console.log('  3. Restart the homeserver');
  console.log(`  4. Set in the bot's .env:`);
  console.log(`     APPSERVICE_REGISTRATION=/path/to/${args.output}`);
  console.log(`     MATRIX_HOMESERVER_NAME=your-domain.com`);
  console.log('  5. Start the bot: docker-compose up -d');
  console.log();
  console.log('Tokens (save these — they cannot be regenerated):');
  console.log(`  as_token: ${registration.as_token}`);
  console.log(`  hs_token: ${registration.hs_token}`);
}

main();
