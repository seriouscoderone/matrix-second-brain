import 'dotenv/config';
import * as path from 'path';
import * as fs from 'fs';
import { MatrixClient, MembershipEvent, MessageEvent, RoomEvent } from 'matrix-bot-sdk';
import { createMatrixClient, sendMessage } from './matrixClient';
import { handleSetupCommand, handleWizardReply, isInSetup } from './setup/wizard';
import { handleInboxMessage } from './handlers/inbox';
import { handleLocationEvent } from './handlers/location';
import { handleProjectMessage } from './handlers/project';
import { getDb, runMigrations } from '../db/migrate';
import { getProjectByRoomId } from '../db/queries/projects';
import { startDailyCron } from '../cron/daily';
import { startWeeklyCron } from '../cron/weekly';
import { startEnrichmentCron } from '../cron/enrich';
import { loadConfigYaml, env } from '../config';

// Ensure data directory exists for bot storage
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

async function main(): Promise<void> {
  console.log('🧠 Matrix Second Brain starting...');

  // Run DB migrations
  await runMigrations();

  const db = getDb();
  const client = createMatrixClient();

  // Record startup time — used to skip historical events replayed on reconnect
  const startupTs = Date.now();

  // Set up message handler
  client.on('room.message', async (roomId: string, event: Record<string, unknown>) => {
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

    const text = (content.body as string)?.trim();
    if (!text) return;

    // !setup command — works in any room
    if (text === '!setup') {
      await handleSetupCommand(client, roomId, userId);
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

  // Start cron jobs
  const digestRoom = loadConfigYaml().rooms.digest;
  if (digestRoom) {
    startDailyCron(db, async (msg) => { await sendMessage(client, digestRoom, msg); });
    startWeeklyCron(db, async (msg) => { await sendMessage(client, digestRoom, msg); });
  }
  startEnrichmentCron(db);

  // Start the bot
  await client.start();
  console.log('✅ Matrix Second Brain is running!');
  console.log(`   Bot: ${env.MATRIX_BOT_USER_ID}`);
  console.log(`   Admin: ${env.ADMIN_MATRIX_ID}`);
  console.log(`   LLM: ${env.LLM_PROVIDER}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
