# Matrix Second Brain

A Matrix bot that turns a Matrix Space into a shared personal productivity system based on the Getting Things Done (GTD) methodology. Drop any thought, task, shopping item, or note into Matrix and the bot classifies, organizes, and reminds you at the right time and place.

## Key Features

- **Natural language capture** -- send any message and the bot classifies it into tasks, events, shopping items, notes, contacts, projects, or reference material
- **GTD workflow** -- inbox capture, next-action tracking, waiting-for follow-ups, someday/maybe lists, weekly reviews
- **Location-aware alerts** -- get notified when you are near a store that has pending shopping items
- **Shared and personal** -- supports multiple users with shared and personal visibility on all items
- **Daily and weekly digests** -- automated cron summaries of tasks due, events today, overdue follow-ups, and stale projects
- **Zettelkasten notes** -- linked note system with auto-generated IDs
- **LLM-powered** -- uses AWS Bedrock (Claude) or direct Anthropic API for classification and extraction

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 20+ |
| Docker & Docker Compose | Latest |
| PostgreSQL | 16+ (provided via Docker for dev) |
| Matrix homeserver | Synapse recommended (provided via Docker for dev) |

## AWS Bedrock Setup (One-Time)

If using `LLM_PROVIDER=bedrock`, create an IAM user with the following policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": "arn:aws:bedrock:us-east-1::foundation-model/us.anthropic.*"
    }
  ]
}
```

1. Go to **IAM > Users > Create User** in the AWS Console.
2. Attach the policy above (create it as a custom policy first).
3. Under **Security credentials**, create an access key (choose "Application running outside AWS").
4. Save the `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` for your `.env` file.
5. In the Bedrock console, go to **Model access** and request access to Anthropic Claude models.

If using `LLM_PROVIDER=anthropic`, you only need an `ANTHROPIC_API_KEY` from console.anthropic.com.

For local development, set `LLM_PROVIDER=mock` to skip external API calls entirely.

## Register Matrix Bot Account

On your Synapse homeserver, register a bot user:

```bash
# Using the Synapse admin API (run on the server)
register_new_matrix_user -c /data/homeserver.yaml http://localhost:8008 \
  --user secondbrain \
  --password YOUR_BOT_PASSWORD \
  --no-admin

# Get an access token by logging in
curl -X POST http://localhost:8008/_matrix/client/v3/login \
  -H "Content-Type: application/json" \
  -d '{
    "type": "m.login.password",
    "user": "secondbrain",
    "password": "YOUR_BOT_PASSWORD"
  }'
```

Save the `access_token` from the response -- this goes into `MATRIX_BOT_ACCESS_TOKEN`.

For local dev with docker-compose.dev.yml, wait for Synapse to start, then run the registration commands against `http://localhost:8008`.

## Local Development

### 1. Start infrastructure

```bash
docker-compose -f docker-compose.dev.yml up -d synapse postgres
```

Wait for both services to be healthy:

```bash
docker-compose -f docker-compose.dev.yml ps
```

### 2. Register users on local Synapse

```bash
# Register the bot
docker-compose -f docker-compose.dev.yml exec synapse \
  register_new_matrix_user -c /data/homeserver.yaml http://localhost:8008 \
  --user secondbrain --password botpass --no-admin

# Register a test user
docker-compose -f docker-compose.dev.yml exec synapse \
  register_new_matrix_user -c /data/homeserver.yaml http://localhost:8008 \
  --user alice --password alicepass --no-admin

# Get bot access token
curl -s -X POST http://localhost:8008/_matrix/client/v3/login \
  -H "Content-Type: application/json" \
  -d '{"type":"m.login.password","user":"secondbrain","password":"botpass"}' \
  | jq -r '.access_token'
```

Update the token in `.env.dev`.

### 3. Install dependencies and run migrations

```bash
npm install
npm run db:migrate
```

### 4. Start the bot

```bash
npm run dev
```

Or run everything together:

```bash
docker-compose -f docker-compose.dev.yml up --build
```

## Production Deployment

### 1. Provision a server

Any Linux VM with Docker installed (e.g., AWS EC2 t3.small, DigitalOcean droplet).

### 2. Set up environment

```bash
ssh your-server
git clone <your-repo-url> /opt/matrix-second-brain
cd /opt/matrix-second-brain
```

Create `.env` with production values:

```bash
cat > .env << 'EOF'
MATRIX_HOMESERVER_URL=https://matrix.yourdomain.com
MATRIX_BOT_USER_ID=@secondbrain:yourdomain.com
MATRIX_BOT_ACCESS_TOKEN=syt_REAL_TOKEN_HERE
ADMIN_MATRIX_ID=@you:yourdomain.com

DATABASE_URL=postgresql://user:password@db-host:5432/secondbrain

LLM_PROVIDER=bedrock
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1

CLASSIFICATION_CONFIDENCE_THRESHOLD=0.7
ALERT_RADIUS_METERS=500
LOCATION_COOLDOWN_MINUTES=120
EOF
```

### 3. Deploy

```bash
docker-compose up -d --build
docker-compose logs -f bot
```

The bot auto-runs database migrations on startup.

## First-Run Wizard

When the admin user sends the first message, the bot starts a setup wizard:

```
You:    !setup
Bot:    Welcome to Second Brain setup! Let's configure your space.
        What would you like to name your space? (e.g., "Our Second Brain")

You:    Family Brain
Bot:    Created space "Family Brain"!
        Who else should have access? Send Matrix IDs separated by commas,
        or "skip" for just you.

You:    @bob:matrix.org
Bot:    Invited @bob:matrix.org.
        Creating rooms... Done!
        - #digest (daily/weekly summaries)
        - #inbox-alice (your personal inbox)
        - #inbox-bob (bob's personal inbox)
        Setup complete! Send any message to your inbox to start capturing.
```

## Using the Bot

Send messages to your inbox room. The bot classifies them automatically.

### Task capture

```
You:    Buy anniversary gift for Sarah by March 15 -- high priority
Bot:    Captured as TASK:
        Title: Buy anniversary gift for Sarah
        Priority: high | Due: Mar 15 | Context: errands
        Owner: alice
```

### Shopping items

```
You:    Need milk, eggs, and bread from Whole Foods
Bot:    Captured as SHOPPING:
        - milk (Whole Foods)
        - eggs (Whole Foods)
        - bread (Whole Foods)
        Linked to place: Whole Foods Market
```

### Events

```
You:    Dinner with the Johnsons next Friday at 7pm at Olive Garden
Bot:    Captured as EVENT:
        Title: Dinner with the Johnsons
        Date: Fri Mar 7, 7:00 PM | Location: Olive Garden
        Contact: The Johnsons
```

### Notes

```
You:    Note: The best way to learn is to teach others. This connects
        to my thinking about knowledge management.
Bot:    Captured as NOTE:
        ID: 2a3b | Title: Learning through teaching
        Tags: #learning #knowledge-management
        Linked to: 1f2e (knowledge management systems)
```

### Location alerts

When you share your location (m.location event) near a store with pending items:

```
Bot:    Hey! You're near Whole Foods (~150m). You have items on your list there:
          - milk
          - eggs
          - bread — added by bob
        Worth a stop if you have time!
```

### Commands

| Command | Description |
|---|---|
| `!setup` | Run the first-time setup wizard |
| `!tasks` | List pending tasks |
| `!tasks @home` | Filter tasks by context |
| `!shopping` | List pending shopping items |
| `!projects` | List active projects |
| `!review` | Trigger a weekly review now |
| `!help` | Show all available commands |

## Running Tests

```bash
# Unit tests
npm test

# Integration tests (requires running Postgres)
npm run test:integration

# Location alert test (outputs curl commands for manual testing)
npm run test:location
```

## Database Access

### psql (command line)

```bash
# Local dev
psql postgresql://postgres:devpassword@localhost:5432/secondbrain_dev

# Via Docker
docker-compose -f docker-compose.dev.yml exec postgres \
  psql -U postgres secondbrain_dev
```

### Drizzle Studio (browser-based)

```bash
npm run db:studio
```

Opens a browser UI at `https://local.drizzle.studio` for inspecting tables and running queries.

### GUI tools (TablePlus, pgAdmin, etc.)

| Field | Value |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| Database | `secondbrain_dev` |
| User | `postgres` |
| Password | `devpassword` |

## Architecture

```
src/
├── ai/               # LLM integration
│   ├── providers/     # Bedrock, Anthropic, and mock LLM providers
│   ├── prompts/       # System prompts for classification and extraction
│   ├── pipeline.ts    # Main classify-then-extract pipeline
│   └── context.ts     # Conversation context builder for richer LLM calls
├── bot/               # Matrix bot entry point
│   ├── index.ts       # Bot startup, Matrix client init, cron scheduling
│   ├── matrixClient.ts# Matrix SDK wrapper with send/reply helpers
│   ├── wizard.ts      # First-run !setup wizard flow
│   └── handlers/      # Message event handlers by type
├── config.ts          # Environment and config.yaml loading with Zod
├── cron/              # Scheduled jobs
│   ├── daily.ts       # Daily digest (tasks, events, follow-ups)
│   ├── weekly.ts      # Weekly review (stale projects, overdue tasks)
│   └── enrich.ts      # Background enrichment for unprocessed inbox items
├── db/                # Database layer
│   ├── schema.ts      # Drizzle ORM table definitions
│   ├── migrate.ts     # Migration runner and DB singleton
│   ├── migrations/    # Generated SQL migration files
│   └── queries/       # Per-table query helpers (CRUD + filters)
├── location/          # Geolocation features
│   ├── proximity.ts   # Haversine distance, nearby place detection
│   └── cooldown.ts    # Per-user per-place alert cooldown tracking
└── matrix/            # Matrix room/space management
    ├── rooms.ts       # Room creation, Space child management
    └── space.ts       # Space creation
```

## Troubleshooting

### Bot does not respond to messages

1. Check that the bot is running: `docker-compose logs bot`
2. Verify the access token is valid: `curl -H "Authorization: Bearer $TOKEN" http://homeserver/_matrix/client/v3/account/whoami`
3. Make sure the bot has been invited to and joined the room
4. Check that the sender's Matrix ID is in the `users` list in `config.yaml`

### Database connection errors

1. Confirm Postgres is running: `docker-compose -f docker-compose.dev.yml ps postgres`
2. Test the connection: `psql $DATABASE_URL -c "SELECT 1"`
3. Check that `DATABASE_URL` in `.env` matches the Postgres container's credentials
4. If using Docker networking, use the service name (`postgres`) not `localhost`

### Synapse registration fails

1. Make sure Synapse has finished starting (check health endpoint): `curl http://localhost:8008/health`
2. If registration is disabled, enable it in `homeserver.yaml`: `enable_registration: true`
3. For local dev, set `enable_registration_without_verification: true`

### LLM classification returns low confidence

1. Check `CLASSIFICATION_CONFIDENCE_THRESHOLD` in `.env` (default 0.7)
2. Try lowering it to 0.5 for testing
3. Verify your AWS Bedrock model access is approved (check the Bedrock console)
4. Switch to `LLM_PROVIDER=anthropic` with a direct API key as an alternative

### Location alerts not firing

1. Verify places exist in the database: `SELECT * FROM places;`
2. Check that shopping items are linked to places: `SELECT * FROM shopping_items WHERE place_id IS NOT NULL AND status = 'pending';`
3. Confirm the alert radius: `echo $ALERT_RADIUS_METERS` (default 500m)
4. Check cooldowns: `SELECT * FROM location_cooldowns;` and consider lowering `LOCATION_COOLDOWN_MINUTES`
5. Use `npm run test:location` to generate test curl commands

### Docker build fails

1. Make sure `package-lock.json` exists (run `npm install` first)
2. Check Node version: the Dockerfile uses `node:20-alpine`
3. If TypeScript compilation fails, run `npm run lint` locally to see errors

### Cron jobs not running

1. Check the schedule in `config.yaml` (uses standard cron syntax)
2. Verify the bot's timezone matches your expectations (Docker containers default to UTC)
3. Look for cron startup logs: `docker-compose logs bot | grep "cron scheduled"`
