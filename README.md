# Matrix Second Brain

A self-hosted Matrix bot that turns a Matrix Space into a shared GTD productivity system. Send any message to your inbox room — the bot classifies it, extracts structured fields using an LLM, and writes a record to PostgreSQL. Location sharing in Element triggers shopping alerts when you're near a relevant store.

## Features

- **Natural language capture** — send anything; the bot figures out whether it's a task, event, shopping item, note, project, contact, resource, or waiting-for
- **GTD workflow** — inbox → classify → project/area/context tagging, next-action tracking, weekly review
- **Location alerts** — get notified when you're within configurable meters of a place with pending shopping items (uses Matrix MSC3488 live location, no third-party services)
- **Multi-user** — shared and personal ownership per record; each user gets a private `#inbox-<name>` room
- **Daily digest** — morning summary of tasks due, events, and follow-ups sent to a shared `#digest` room
- **Weekly review** — Monday summary of stale projects and overdue items
- **Zettelkasten notes** — linked note system with auto-generated YYYYMMDDHHMMSS IDs
- **Pluggable LLM** — AWS Bedrock (Claude), direct Anthropic API, or a keyword-based mock for local dev with no API costs

## How It Works

```
User sends message to #inbox-alice
        ↓
Bot asks clarifying question if intent is ambiguous
        ↓
LLM classifies → one of 10 GTD categories
        ↓
LLM enriches → fills due dates, urgency, matched contacts, etc.
        ↓
Record inserted into PostgreSQL
        ↓
Bot replies in thread: "✅ Saved as task: Call dentist"
        ↓
If category=project → bot also creates a #project-<name> Matrix room
```

## Tech Stack

- **Runtime**: Node.js 20, TypeScript
- **Matrix**: [`matrix-bot-sdk`](https://github.com/turt2live/matrix-bot-sdk)
- **Database**: PostgreSQL 16 + [Drizzle ORM](https://orm.drizzle.team/)
- **LLM**: AWS Bedrock (Anthropic Claude) or Anthropic API directly
- **Validation**: Zod
- **Scheduler**: node-cron
- **Dev environment**: Docker Compose (local Synapse + Postgres)

## Prerequisites

- Docker and Docker Compose
- A running Matrix homeserver (Synapse recommended; one is included in the dev stack)
- PostgreSQL 16+ (included in the dev stack)
- One of: AWS account with Bedrock access, Anthropic API key, or `LLM_PROVIDER=mock` for local dev

## Quick Start (Local Dev)

Everything runs locally in Docker — no external services needed when using the mock LLM.

### 1. Generate Synapse config

```bash
docker run --rm \
  -e SYNAPSE_SERVER_NAME=localhost \
  -e SYNAPSE_REPORT_STATS=no \
  -v "$(pwd)/dev/synapse-data:/data" \
  matrixdotorg/synapse:latest generate
```

Add the following to `dev/synapse-data/homeserver.yaml` (before the final comment line):

```yaml
enable_registration: true
enable_registration_without_verification: true
suppress_key_server_warning: true
```

### 2. Start infrastructure

```bash
docker-compose -f docker-compose.dev.yml up -d synapse postgres
```

Wait for both to be healthy:

```bash
docker-compose -f docker-compose.dev.yml ps
```

### 3. Register Matrix accounts

```bash
# Register the bot account
docker exec matrix-second-brain-synapse-1 \
  register_new_matrix_user -u secondbrain -p <password> -a \
  -c /data/homeserver.yaml http://localhost:8008

# Register your user account
docker exec matrix-second-brain-synapse-1 \
  register_new_matrix_user -u alice -p <password> --no-admin \
  -c /data/homeserver.yaml http://localhost:8008

# Get the bot's access token
curl -sf -X POST http://localhost:8008/_matrix/client/v3/login \
  -H 'Content-Type: application/json' \
  -d '{"type":"m.login.password","user":"secondbrain","password":"<password>"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])"
```

### 4. Configure environment

```bash
cp .env.example .env.dev
```

Edit `.env.dev`:

```env
MATRIX_HOMESERVER_URL=http://synapse:8008
MATRIX_BOT_USER_ID=@secondbrain:localhost
MATRIX_BOT_ACCESS_TOKEN=<token from step 3>
ADMIN_MATRIX_ID=@alice:localhost

DATABASE_URL=postgresql://postgres:devpassword@postgres:5432/secondbrain_dev

LLM_PROVIDER=mock   # no API key needed
```

### 5. Build and start the bot

```bash
docker-compose -f docker-compose.dev.yml up -d bot
docker-compose -f docker-compose.dev.yml logs -f bot
```

You should see:
```
✅ Matrix Second Brain is running!
   Bot: @secondbrain:localhost
   Admin: @alice:localhost
   LLM: mock
```

### 6. Run the setup wizard

Using [Element Web](https://app.element.io) pointed at `http://localhost:8008`, or any Matrix client:

1. DM `@secondbrain:localhost`
2. Send `!setup`
3. Follow the prompts — the bot will create a Space with inbox and digest rooms

## Production Deployment

### LLM: AWS Bedrock

1. In the AWS Console, go to **Bedrock → Model access** and request access to Anthropic Claude models (~5 minutes for approval).
2. Create an IAM user with this policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
    "Resource": "arn:aws:bedrock:us-east-1::foundation-model/us.anthropic.*"
  }]
}
```

3. Generate access keys for the IAM user → add to `.env`.

### LLM: Anthropic API

Set `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY=sk-ant-...`. No AWS account needed.

### Deploy

```bash
ssh your-server
git clone <repo-url> /opt/matrix-second-brain
cd /opt/matrix-second-brain
cp .env.example .env
# edit .env with production values
docker-compose up -d --build
docker-compose logs -f bot
```

The bot runs migrations automatically on startup and connects to your existing Synapse and PostgreSQL instances.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `MATRIX_HOMESERVER_URL` | Yes | Full URL of your Matrix homeserver |
| `MATRIX_BOT_USER_ID` | Yes | Bot's Matrix ID, e.g. `@secondbrain:yourdomain.com` |
| `MATRIX_BOT_ACCESS_TOKEN` | Yes | Bot's access token (from `/login`) |
| `ADMIN_MATRIX_ID` | Yes | Matrix ID allowed to run `!setup` |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `LLM_PROVIDER` | Yes | `bedrock`, `anthropic`, or `mock` |
| `AWS_ACCESS_KEY_ID` | Bedrock only | IAM access key |
| `AWS_SECRET_ACCESS_KEY` | Bedrock only | IAM secret key |
| `AWS_REGION` | Bedrock only | Default: `us-east-1` |
| `ANTHROPIC_API_KEY` | Anthropic only | API key from console.anthropic.com |
| `CLASSIFICATION_CONFIDENCE_THRESHOLD` | No | Default: `0.7` |
| `ALERT_RADIUS_METERS` | No | Default: `500` |
| `LOCATION_COOLDOWN_MINUTES` | No | Default: `120` |

## Capture Categories

The bot classifies free-text messages into these GTD+PARA categories:

| Category | Example message |
|---|---|
| `task` | "todo: call dentist to reschedule" |
| `project` | "Start a project: redesign home office" |
| `waiting_for` | "Follow up with landlord about lease next month" |
| `event` | "Meeting with accountant Thursday at 2pm" |
| `contact` | "Met Sarah Chen at the conference — she works at Acme Corp" |
| `resource` | "Read this: https://example.com/article" |
| `note` | "Note: the key insight about GTD is capture first, process later" |
| `shopping` | "Buy a standing desk lamp for the office" |
| `someday_maybe` | "Someday: learn to sail" |
| `area` | "Area: Health — maintain consistent sleep schedule" |

When the bot creates a `project` record, it also creates a Matrix room (`#project-<name>`) in the Space.

## Location Alerts

Share your live location in Element (Attachment → Location → Share live location). The bot receives `m.location` events and runs a Haversine distance check against all places in the `places` table. If you're within `ALERT_RADIUS_METERS` of a place that has pending shopping items, it sends an alert to your inbox room.

To add a place, insert a row into the `places` table directly in PostgreSQL — there is no bot command for this yet.

Alerts are rate-limited per user per place (default: once every 2 hours) via the `location_cooldowns` table.

## Database Access

Connect any PostgreSQL client to view and query your data.

```bash
# psql (local dev)
docker exec -it matrix-second-brain-postgres-1 psql -U postgres secondbrain_dev

# Drizzle Studio (browser UI)
npm run db:studio
```

## Running Tests

```bash
# Unit tests (no network, no DB)
npm test

# Integration tests (requires docker-compose.dev.yml running)
npm run test:integration
```

## Troubleshooting

**Bot doesn't respond to messages**

Check that the bot joined the room: `docker-compose logs bot | tail -50`. If you see `M_FORBIDDEN` on room creation, the bot may be trying to invite itself — this is a known issue when running `!setup` on a bot that is also listed in the invite list.

**`M_LIMIT_EXCEEDED` errors during setup**

Synapse's default rate limits are strict. Add to `dev/synapse-data/homeserver.yaml`:

```yaml
rc_message:
  per_second: 100
  burst_count: 200
rc_creates:
  per_second: 100
  burst_count: 200
rc_invites:
  per_room:
    per_second: 100
    burst_count: 200
  per_user:
    per_second: 100
    burst_count: 200
```

Then restart Synapse: `docker-compose -f docker-compose.dev.yml restart synapse`.

**Bot replays old messages on restart**

This is handled — the bot records its startup timestamp and ignores events with `origin_server_ts` older than that. If you wipe the bot container and restart, old setup wizard messages will be correctly ignored.

**LLM classification seems wrong**

The mock provider uses keyword matching and is intentionally simple. With a real LLM provider (Bedrock or Anthropic), classification accuracy is much higher. Check `LLM_PROVIDER` in your `.env`.

**Docker build fails**

The Dockerfile uses `node:20-slim` (Debian). Do not switch to `node:20-alpine` — the `@matrix-org/matrix-sdk-crypto-nodejs` native module does not support Linux arm64 musl (Alpine's libc).

## License

MIT
