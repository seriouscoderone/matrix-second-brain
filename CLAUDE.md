# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Build TypeScript
npm run build

# Type-check without emitting (lint)
npm run lint

# Run unit tests (offline, no DB or Matrix required)
npm test

# Run a single test file
npx jest src/__tests__/unit/proximity.test.ts

# Run integration tests (requires docker-compose.dev.yml running)
npm run test:integration

# Local dev with docker-compose (Synapse + Postgres + bot)
docker-compose -f docker-compose.dev.yml up

# Wipe and restart everything cleanly
docker-compose -f docker-compose.dev.yml down --volumes
rm -rf dev/synapse-data/*
# Then re-generate Synapse config, re-register users, update .env.dev token (see below)

# Drizzle schema management
npm run db:generate   # generate new migration from schema changes
npm run db:migrate    # run migrations manually (also runs automatically on bot startup)
npm run db:studio     # open Drizzle Studio GUI

# Simulate a location event for proximity testing
npm run test:location
```

## Local Dev Setup

The dev stack runs entirely in Docker:
- **Synapse** (local Matrix homeserver) on port 8008
- **Postgres** on port 5432
- **Bot** container connecting to both

After a clean wipe, bootstrap sequence:
```bash
# 1. Generate Synapse config
docker run --rm -e SYNAPSE_SERVER_NAME=localhost -e SYNAPSE_REPORT_STATS=no \
  -v "$(pwd)/dev/synapse-data:/data" matrixdotorg/synapse:latest generate

# 2. Add to dev/synapse-data/homeserver.yaml (before the vim: line):
#    enable_registration: true
#    enable_registration_without_verification: true
#    suppress_key_server_warning: true
#    rc_message: {per_second: 100, burst_count: 200}   # + other rc_* rate limits

# 3. Start infra
docker-compose -f docker-compose.dev.yml up -d synapse postgres

# 4. Register users
docker exec matrix-second-brain-synapse-1 register_new_matrix_user \
  -u secondbrain -p botpassword123 -a -c /data/homeserver.yaml http://localhost:8008
docker exec matrix-second-brain-synapse-1 register_new_matrix_user \
  -u alice -p alicepassword123 --no-admin -c /data/homeserver.yaml http://localhost:8008

# 5. Get bot token and update .env.dev
curl -sf -X POST http://localhost:8008/_matrix/client/v3/login \
  -H 'Content-Type: application/json' \
  -d '{"type":"m.login.password","user":"secondbrain","password":"botpassword123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])"
# Paste result into MATRIX_BOT_ACCESS_TOKEN in .env.dev

# 6. Start bot
docker-compose -f docker-compose.dev.yml build bot && docker-compose -f docker-compose.dev.yml up -d bot

# 7. Run !setup wizard
# Use python3 urllib.request to send Matrix API calls (curl has shell escaping issues with ! in room IDs)
# Room IDs like !abc:localhost must be URL-encoded as %21abc%3Alocalhost in HTTP paths
```

**LLM_PROVIDER=mock** in `.env.dev` — no API keys needed for local dev. The mock uses keyword rules for classification and costs nothing.

## Architecture

### Message Flow

```
Matrix room.message event
  → bot/index.ts (startup-timestamp filter → ignore historical replays)
  → handleSetupCommand()     if text === '!setup'
  → handleWizardReply()      if user is in wizard flow (in-memory Map)
  → handleInboxMessage()     if roomId ∈ loadConfigYaml().rooms.inbox values
  → handleProjectMessage()   if roomId matches a projects.matrix_room_id in DB
```

**Critical**: `loadConfigYaml()` is called fresh on every message (not a cached singleton) so inbox routing works immediately after the wizard writes `config.yaml`. The startup timestamp (`startupTs = Date.now()` before `client.start()`) prevents historical events from being replayed on bot restart.

### AI Pipeline (`src/ai/pipeline.ts`)

6-stage pipeline called from `handleInboxMessage`:
1. **Clarify** — LLM decides if intent is ambiguous; if yes, returns questions and bot asks in thread; user reply merges with original and re-enters pipeline
2. **Context load** — queries active projects, contacts, areas, pending tasks from DB → formatted string passed to LLM
3. **Classify + extract** — LLM returns JSON validated by `ClassificationSchema` (Zod): `{category, confidence, owner, createdBy, fields{}}`
4. **Enrich** — second LLM pass to fill empty fields (due dates, contact matching, etc.)
5. **Write to DB** — `writeRecord()` dispatches to per-category writer function
6. **Return result** — if category=`project`, sets `newProjectRoom: true`; caller creates Matrix room and updates `projects.matrix_room_id`

### LLM Providers (`src/ai/providers/`)

All implement `LLMProvider` interface: `chat(systemPrompt, messages[])` and `complete(systemPrompt, userMessage)`.

- **`mock.ts`**: Keyword regex rules classify by user message content. Detects call type by user message prefix: `"Evaluate whether"` → clarification, `"Enrich this"` → enrichment, `"Captured by:"` → classification. Extracts title from the line after `"Message:\n"` in the LLM prompt.
- **`bedrock.ts`**: `@aws-sdk/client-bedrock-runtime` with `AnthropicBedrock`. Default for production.
- **`anthropic.ts`**: Direct Anthropic API via `@anthropic-ai/sdk`. Alternative for production.

Provider is selected by `env.LLM_PROVIDER` enum (`bedrock|anthropic|mock`).

### Configuration (`src/config.ts`)

Two-layer config:
- **`.env`** — secrets (tokens, DB URL, AWS keys). Zod-validated at startup; process exits on invalid env.
- **`config.yaml`** — non-secret preferences (space/room IDs, user list, cron schedules). Written by the `!setup` wizard. **Never cached as a singleton** — call `loadConfigYaml()` each time (the file changes at runtime).

### Database (`src/db/`)

- **`schema.ts`** — all 15 Drizzle tables + 11 enums. Every record has `owner` (`alice|bob|shared`) and `created_by` (Matrix display name string, NOT userId).
- **`migrate.ts`** — `runMigrations()` runs on startup from `src/db/migrations/` (not `dist/` — tsc doesn't copy `.sql` files). `getDb()` returns a singleton `Db` instance (`ReturnType<typeof createDb>`).
- **`queries/`** — one file per entity with typed Drizzle query helpers.

The `Db` type is `ReturnType<typeof createDb>` from `migrate.ts` — use this instead of `NodePgDatabase<typeof schema>` to avoid type inference issues under ts-jest.

### Location Proximity (`src/location/`)

Purely deterministic — no LLM involved:
- `proximity.ts`: Haversine formula against all `places` rows; finds pending `shopping_items` linked to places within `ALERT_RADIUS_METERS`; routes alert to the user who sent the location event
- `cooldown.ts`: per-user, per-place cooldown in `location_cooldowns` table; default 120 minutes
- Triggered by `m.location` msgtype events (Matrix MSC3488 live location)

### Cron Jobs (`src/cron/`)

All use `node-cron` with schedules from `config.yaml`. Cron callbacks must return `void` — wrap `sendMessage` in `async (msg) => { await sendMessage(...) }` to discard the returned `Promise<string>`.

- `daily.ts` — tasks due today, events today, follow-ups overdue → `#digest` room
- `weekly.ts` — stale projects, overdue tasks, someday/maybe past review date
- `enrich.ts` — finds unprocessed `inbox_items` older than 5 min for background retry

### Matrix Room Management (`src/matrix/`)

- `space.ts` — creates a Matrix Space (m.space room type)
- `rooms.ts` — `createInboxRoom()`, `createProjectRoom()`, `addRoomToSpace()`. **Do not pass the bot's own user ID in the `members` invite list** — the bot is the room creator and is already a member; inviting itself causes `M_FORBIDDEN`.

All Matrix API calls use a `MatrixClientLike` interface (not the raw SDK client) to keep things testable.

### Setup Wizard (`src/bot/setup/wizard.ts`)

State stored in-memory `Map<userId, WizardState>`. Three steps: space name → invite users → done. On completion, creates Space, digest room, inbox rooms (one per user), then calls `saveConfigYaml()`. The wizard state is lost on bot restart (by design — wizard is run once).

## Key Gotchas

- **`config` singleton trap**: `src/config.ts` exports `const config = loadConfigYaml()` but also exports `loadConfigYaml`. Always call `loadConfigYaml()` directly in message handlers — never use the `config` export for `rooms.inbox`, `rooms.digest`, or `users` since these are written by the wizard after startup.
- **Historical replay**: On restart, matrix-bot-sdk replays all room messages since the last sync token. The `startupTs` filter in `index.ts` drops events with `origin_server_ts < startupTs`. Without this, the wizard re-runs on replay and creates duplicate rooms.
- **Synapse rate limits**: Default local Synapse is very strict. Add `rc_message`, `rc_creates`, `rc_invites`, etc. with high limits to `dev/synapse-data/homeserver.yaml` for dev.
- **URL encoding**: Matrix room IDs (`!roomid:server`) must be encoded as `%21roomid%3Aserver` in HTTP path segments. Use Python's `urllib.parse.quote(room_id, safe='')` — macOS `curl` has shell escaping issues with `!`.
- **Docker base image**: Must use `node:20-slim` (Debian/glibc), NOT `node:20-alpine` — `@matrix-org/matrix-sdk-crypto-nodejs` doesn't support Linux arm64 musl.
- **Migration path**: Drizzle migrator reads from `process.cwd()/src/db/migrations/`, not `__dirname`, because tsc doesn't copy `.sql` files to `dist/`.
