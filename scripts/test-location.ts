#!/usr/bin/env ts-node

/**
 * Location API Test Script
 *
 * This script prints setup instructions and ready-to-run curl commands
 * for testing the location-based proximity alert system.
 *
 * Usage:
 *   npx ts-node scripts/test-location.ts
 *
 * Before running the curl commands, ensure:
 *   1. docker-compose.dev.yml is running (Matrix homeserver + PostgreSQL)
 *   2. The bot is running (npm run dev)
 *   3. Test data has been inserted into the DB (see SQL below)
 */

const HOMESERVER = process.env.TEST_HOMESERVER || 'http://localhost:8008';
const ALICE_TOKEN = process.env.ALICE_DEV_TOKEN || '<replace-with-alice-token>';
const ALICE_INBOX = process.env.ALICE_INBOX_ROOM || '<replace-with-inbox-room-id>';

// ─── Setup SQL ──────────────────────────────────────────────────────────────

console.log(`
================================================================================
  LOCATION PROXIMITY ALERT -- TEST SCRIPT
================================================================================

STEP 1: Insert test data into PostgreSQL
-----------------------------------------
Run the following SQL in psql (or via your DB client):

  -- Add test places:
  INSERT INTO places (name, lat, lon, address, owner, created_by)
  VALUES
    ('Whole Foods', 37.7749, -122.4194, '1765 California St', 'shared', 'test'),
    ('Target', 37.7831, -122.4085, '789 Mission St', 'shared', 'test');

  -- Add a pending shopping item linked to Whole Foods:
  INSERT INTO shopping_items (item, where_to_buy, urgency, status, place_id, owner, created_by)
  SELECT 'Standing desk lamp', 'Whole Foods', 'medium', 'pending', id, 'shared', 'alice'
  FROM places WHERE name = 'Whole Foods';

STEP 2: Make sure the bot is running
--------------------------------------
  npm run dev

STEP 3: Run the test cases below
----------------------------------
`);

// ─── Test Cases ─────────────────────────────────────────────────────────────

interface TestCase {
  name: string;
  lat: number;
  lon: number;
  description: string;
  expected: string;
}

const testCases: TestCase[] = [
  {
    name: 'Test 1: Near Whole Foods (San Francisco)',
    lat: 37.7749,
    lon: -122.4194,
    description: 'User is at the exact location of Whole Foods in SF.',
    expected:
      'Should trigger a proximity alert because Whole Foods is in the places DB ' +
      'and has a pending shopping item ("Standing desk lamp") within 500m.',
  },
  {
    name: 'Test 2: Far away (Los Angeles)',
    lat: 34.0522,
    lon: -118.2437,
    description: 'User is in Los Angeles, far from any test place.',
    expected: 'No alert. User is ~559km from Whole Foods -- well outside 500m radius.',
  },
  {
    name: 'Test 3: Same location again within 2 hours (SF / cooldown test)',
    lat: 37.7749,
    lon: -122.4194,
    description:
      'User sends location from the same spot as Test 1, within the 2-hour cooldown window.',
    expected:
      'No alert. The location cooldown prevents re-alerting for the same place ' +
      'within LOCATION_COOLDOWN_MINUTES (default 120 minutes).',
  },
  {
    name: 'Test 4: Near Target (different store)',
    lat: 37.7831,
    lon: -122.4085,
    description: 'User is near Target in SF.',
    expected:
      'Alert only if Target has pending shopping items linked to it. ' +
      'With the setup SQL above, Target has no items, so no alert is expected. ' +
      'Add items to Target to test a positive case.',
  },
];

for (const tc of testCases) {
  // Matrix location event body
  const locationEvent = {
    msgtype: 'm.location',
    body: `Location: ${tc.lat}, ${tc.lon}`,
    geo_uri: `geo:${tc.lat},${tc.lon}`,
    info: {
      description: tc.name,
    },
  };

  const curlCmd = [
    'curl -s -X PUT',
    `  "${HOMESERVER}/_matrix/client/v3/rooms/${ALICE_INBOX}/send/m.room.message/\$(date +%s%N)"`,
    `  -H "Authorization: Bearer ${ALICE_TOKEN}"`,
    '  -H "Content-Type: application/json"',
    `  -d '${JSON.stringify(locationEvent)}'`,
  ].join(' \\\n');

  console.log(`
--- ${tc.name} ---
${tc.description}

Expected: ${tc.expected}

Command:
${curlCmd}
`);
}

console.log(`
================================================================================
  NOTES
================================================================================
- Replace <replace-with-alice-token> with a valid access token for Alice.
- Replace <replace-with-inbox-room-id> with the inbox room ID (e.g., !abc:localhost).
- Set environment variables to avoid editing this script:
    export TEST_HOMESERVER=http://localhost:8008
    export ALICE_DEV_TOKEN=syt_xxxx
    export ALICE_INBOX_ROOM=!roomid:localhost
- After Test 1 triggers an alert, wait 2+ hours (or reset the location_cooldowns
  table) before re-running Test 1 to see the alert again.
- To add items to Target for Test 4:
    INSERT INTO shopping_items (item, where_to_buy, urgency, status, place_id, owner, created_by)
    SELECT 'HDMI cable', 'Target', 'low', 'pending', id, 'shared', 'bob'
    FROM places WHERE name = 'Target';
================================================================================
`);
