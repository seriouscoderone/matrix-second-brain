# API & Event Contracts (Suite-Level) -- Matrix Second Brain

## API Style & Conventions

This system has **no HTTP API**. It is a Matrix chat bot -- all interaction occurs through the Matrix Client-Server API (as a client of the homeserver). The bot consumes Matrix room events and produces Matrix messages in response.

- **Style**: Event-driven message processing over the Matrix protocol. No REST/GraphQL/gRPC endpoints are exposed by the bot.
- **Base URL Pattern**: N/A. The bot connects to the homeserver at `MATRIX_HOMESERVER_URL` (e.g., `https://matrix.example.com`) and uses the Matrix Client-Server API v3 endpoints (`/_matrix/client/v3/*`) as a client, not a server.
- **Naming Conventions**: Matrix event types follow the Matrix specification (e.g., `m.room.message`, `m.space.child`, `m.space.parent`). Internal function names use camelCase TypeScript conventions.
- **Documentation**: No public API documentation is needed. The system's interface is the set of Matrix room events it listens to and the messages it sends back.

---

## Authentication & Authorization Scheme

- **Mechanism**: The bot authenticates to the Matrix homeserver using a long-lived access token (`MATRIX_BOT_ACCESS_TOKEN`), obtained via the `/_matrix/client/v3/login` endpoint during setup. Human users authenticate with the homeserver independently (password, SSO, etc. as configured on the homeserver).
- **Token Format**: Opaque homeserver-issued access token (not JWT). Stored in `.env` / `.env.dev`.
- **Refresh Strategy**: Matrix access tokens do not expire unless explicitly revoked or the homeserver has a token lifetime policy. No refresh mechanism is implemented in the bot.
- **Permission Model**: The bot identifies users by their full Matrix user ID (`@username:server`) extracted from the `event.sender` field of each Matrix event. Authorization checks:
  - `!setup` command: `userId === env.ADMIN_MATRIX_ID` (admin-only).
  - Inbox routing: `roomId` must appear in `config.yaml` `rooms.inbox` values.
  - Project routing: `roomId` must match a `projects.matrix_room_id` in the database.
  - All other access control is delegated to Matrix room membership (only room members can send events in private rooms).
- **Service-to-Service Auth**: N/A (single-service architecture). The bot calls the LLM provider using either AWS credentials (Bedrock) or an API key (Anthropic), configured in `.env`.

---

## Versioning Strategy

- **Approach**: No versioning. The bot is a single-service monolith with no external API consumers. Breaking changes are deployed as new bot versions.
- **Deprecation Policy**: N/A.
- **Compatibility Rules**: The Matrix protocol provides forward compatibility (unknown event fields are ignored). Database schema changes are managed through Drizzle migrations (`src/db/migrations/`).

---

## Rate Limiting Policy

The bot does not expose an API, so it does not implement rate limiting. However, it is subject to rate limits imposed by the Matrix homeserver.

| Context | Limit | Source | Mitigation |
|---|---|---|---|
| Incoming events | N/A (bot processes all events sequentially) | Matrix sync loop (matrix-bot-sdk) | Historical event replay is filtered by `startupTs` |
| Outgoing messages | Subject to homeserver `rc_message` limits | Synapse rate limiting config | Dev: set high `rc_message` limits in `homeserver.yaml` |
| Room creation | Subject to homeserver `rc_creates` limits | Synapse rate limiting config | Dev: set high `rc_creates` limits |
| Invites | Subject to homeserver `rc_invites` limits | Synapse rate limiting config | Dev: set high `rc_invites` limits |
| LLM calls | Subject to provider rate limits (Bedrock/Anthropic) | AWS/Anthropic API | No retry logic implemented; pipeline errors are caught and reported to user |
| Proximity alerts | Cooldown: 1 alert per user per place per 120 min (configurable via `LOCATION_COOLDOWN_MINUTES`) | Application logic in `cooldown.ts` | Upsert-based cooldown in `location_cooldowns` table |

---

## Common Request/Response Envelopes

Since the bot communicates exclusively through Matrix events, the "request" is a Matrix room event and the "response" is a Matrix message sent by the bot.

### Inbound Event (Request) -- Matrix room.message

```json
{
  "type": "m.room.message",
  "event_id": "$eventId",
  "sender": "@alice:localhost",
  "origin_server_ts": 1709400000000,
  "room_id": "!roomId:localhost",
  "content": {
    "msgtype": "m.text",
    "body": "Buy milk at Trader Joe's"
  }
}
```

### Inbound Event -- Matrix m.location

```json
{
  "type": "m.room.message",
  "event_id": "$eventId",
  "sender": "@alice:localhost",
  "origin_server_ts": 1709400000000,
  "room_id": "!roomId:localhost",
  "content": {
    "msgtype": "m.location",
    "body": "My location",
    "geo_uri": "geo:37.7749,-122.4194",
    "org.matrix.msc3488.location": {
      "uri": "geo:37.7749,-122.4194"
    }
  }
}
```

### Outbound Message (Success) -- Confirmation Reply

```json
{
  "msgtype": "m.text",
  "body": "Saved as **shopping**: Buy milk",
  "format": "org.matrix.custom.html",
  "formatted_body": "Saved as <strong>shopping</strong>: Buy milk",
  "m.relates_to": {
    "rel_type": "m.thread",
    "event_id": "$originalEventId",
    "is_falling_back": true,
    "m.in_reply_to": { "event_id": "$originalEventId" }
  }
}
```

### Outbound Message (Clarification Needed)

```json
{
  "msgtype": "m.text",
  "body": "I need a bit more info:\n- Which meeting are you referring to?\n- What date?",
  "m.relates_to": {
    "rel_type": "m.thread",
    "event_id": "$originalEventId",
    "is_falling_back": true,
    "m.in_reply_to": { "event_id": "$originalEventId" }
  }
}
```

### Outbound Message (Error)

```json
{
  "msgtype": "m.text",
  "body": "Error processing message: LLM provider returned invalid JSON",
  "m.relates_to": {
    "rel_type": "m.thread",
    "event_id": "$originalEventId",
    "is_falling_back": true,
    "m.in_reply_to": { "event_id": "$originalEventId" }
  }
}
```

### Outbound Message (Proximity Alert)

```json
{
  "msgtype": "m.text",
  "body": "Hey! You're near Trader Joe's (~150m). You have items on your list there:\n  - Milk -- added by bob\n  - Eggs\nWorth a stop if you have time!",
  "format": "org.matrix.custom.html",
  "formatted_body": "Hey! You're near Trader Joe's (~150m)..."
}
```

### Outbound Message (Daily Digest)

```json
{
  "msgtype": "m.text",
  "body": "**Daily Digest**\n\n**Tasks due today:**\n  - [high] Fix leaky faucet (alice)\n\n**Events today:**\n  - 02:00 PM -- Dentist @ Main St Dental\n\n**Follow-ups due:**\n  - Waiting for quote from plumber (bob)",
  "format": "org.matrix.custom.html",
  "formatted_body": "<strong>Daily Digest</strong><br>..."
}
```

---

## Internal Service Contracts

### LLM Provider Interface

All LLM providers implement the `LLMProvider` interface (`src/ai/providers/interface.ts`):

```typescript
interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface LLMResponse {
  content: string;       // Raw text response from the LLM
  model: string;         // Model identifier
  inputTokens?: number;  // Token usage (optional)
  outputTokens?: number;
}

interface LLMProvider {
  chat(systemPrompt: string, messages: LLMMessage[]): Promise<LLMResponse>;
  complete(systemPrompt: string, userMessage: string): Promise<LLMResponse>;
}
```

Implementations: `BedrockProvider`, `AnthropicProvider`, `MockProvider`. Selected by `env.LLM_PROVIDER`.

### AI Pipeline Contract

The pipeline (`src/ai/pipeline.ts`) exposes a single entry point:

```typescript
function processCapturedMessage(
  content: string,                    // Raw message text
  capturedBy: string,                 // Username who sent it
  matrixRoomId: string,               // Source room ID
  db: Db,                             // Database handle
  clarificationContext?: PipelineContext,  // Merged context if this is a clarification reply
): Promise<PipelineResult>
```

**PipelineResult**:
```typescript
interface PipelineResult {
  category: string;               // One of the 10 classification categories
  title: string;                  // Human-readable title of the created record
  recordId: string;               // UUID of the inserted DB record
  needsClarification: boolean;    // True if pipeline is requesting follow-up
  clarifyingQuestions: string[];   // Questions to ask the user (if needsClarification)
  owner: 'alice' | 'bob' | 'shared';
  createdBy: string;
  newProjectRoom?: boolean;       // True if a Matrix room should be created
  projectName?: string;           // Name for the new project room
}
```

### Classification Schema (LLM Output Contract)

The LLM must return JSON conforming to `ClassificationSchema` (Zod-validated):

```typescript
{
  category: 'task' | 'project' | 'waiting_for' | 'event' | 'contact' |
            'resource' | 'note' | 'shopping' | 'someday_maybe' | 'area',
  confidence: number,           // 0.0 to 1.0
  needsClarification: boolean,
  clarifyingQuestions: string[], // Empty array if no clarification needed
  owner: 'alice' | 'bob' | 'shared',
  createdBy: string,            // The capturedBy value passed through
  fields: Record<string, unknown>  // Category-specific extracted fields
}
```

### Clarification Schema (LLM Output Contract)

The LLM clarification check must return JSON conforming to `ClarifySchema`:

```typescript
{
  needsClarification: boolean,
  questions: string[],    // 1-3 clarifying questions (empty if not needed)
  confidence: number      // 0.0 to 1.0
}
```

### MatrixClientLike Interface

Abstraction used by room/space creation functions for testability:

```typescript
interface MatrixClientLike {
  createRoom(options: Record<string, unknown>): Promise<string>;
  sendStateEvent(roomId: string, type: string, content: Record<string, unknown>, stateKey?: string): Promise<string>;
  inviteUser(roomId: string, userId: string): Promise<void>;
}
```

### Database Handle (Db)

The `Db` type is `ReturnType<typeof createDb>` from `src/db/migrate.ts` -- a Drizzle ORM database handle wrapping a node-postgres pool. Passed as a dependency to all handlers, pipeline functions, cron jobs, and query functions.

---

## Shared Event Bus

There is no external event bus (no RabbitMQ, Kafka, or similar). The Matrix protocol itself acts as the event transport:

- **Transport**: Matrix Client-Server API sync loop (via `matrix-bot-sdk`). The bot receives events through the `/sync` endpoint long-polling mechanism.
- **Event Naming Convention**: Matrix standard event types:
  - `m.room.message` -- text messages, location events
  - `m.space.child` / `m.space.parent` -- Space hierarchy
  - `m.room.member` -- room membership (auto-join via `AutojoinRoomsMixin`)
- **Event Envelope**: Matrix event JSON as defined by the Matrix Client-Server specification. Key fields: `type`, `event_id`, `sender`, `origin_server_ts`, `room_id`, `content`.
- **Delivery Guarantees**: At-least-once. Matrix sync provides reliable delivery, but the bot may see replayed events on restart (mitigated by the `startupTs` filter).
- **Schema Registry**: N/A. Event schemas are defined by the Matrix specification. LLM output schemas are validated by Zod at runtime (`ClassificationSchema`, `ClarifySchema`).
- **Dead Letter Policy**: Pipeline failures are caught and reported to the user as error messages in the thread. The enrichment cron identifies unprocessed `InboxItem` records older than 5 minutes for background retry (currently logs only).
- **Retry Strategy**: No automatic retry on pipeline failure. The enrichment cron provides a periodic sweep for missed items. LLM provider errors are caught with fallback behavior (clarification check failure proceeds to classification; enrichment failure uses original fields).

### Internal Event Flow (Application-Level)

The bot routes events through an in-process handler chain. There is no pub/sub within the application -- routing is synchronous and sequential:

```
Matrix sync event
  |
  v
[Startup timestamp filter] -- drop if origin_server_ts < startupTs
  |
  v
[Self-message filter] -- drop if sender === BOT_USER_ID
  |
  v
[msgtype router]
  |
  +-- m.location --> LocationHandler --> ProximityEngine --> (optional) send alert
  |
  +-- m.text
       |
       +-- "!setup" --> WizardHandler (admin only)
       |
       +-- isInSetup(userId) --> WizardHandler (continue flow)
       |
       +-- roomId in config.rooms.inbox --> InboxHandler --> AI Pipeline --> DB write --> reply
       |
       +-- roomId matches project --> ProjectHandler --> DB write (task) --> reply
       |
       +-- (no match) --> ignored
```

---

## Cross-App Communication Patterns

This is a single-application monolith. There are no cross-app communication requirements.

- **Synchronous**: All processing happens in-process. The bot calls the LLM provider synchronously (await) during pipeline execution.
- **Asynchronous**: Cron jobs run on independent schedules via `node-cron`. They read from the database and send messages to the digest room.
- **Data Ownership**: The bot owns all data in the PostgreSQL database. The Matrix homeserver owns room state, membership, and message history. The bot reads room events via sync and writes messages via the Client-Server API.
- **Transaction Strategy**: Single-database transactions via Drizzle ORM. No distributed transactions. If room creation succeeds but the DB update for `matrixRoomId` fails, the project record exists without a linked room (logged as error, not rolled back).

---

## Health Check & Status Conventions

No formal health check endpoints exist (the bot is not an HTTP server). Operational health is observable through:

- **Startup Logging**: The bot logs its configuration on startup:
  ```
  Matrix Second Brain starting...
  Matrix Second Brain is running!
     Bot: @secondbrain:localhost
     Admin: @alice:localhost
     LLM: mock
  ```
- **Cron Schedule Logging**: Each cron job logs its schedule on initialization (e.g., `Daily digest cron scheduled: 0 8 * * *`).
- **Event Processing Logging**: Every incoming `room.message` event is logged with sender and content preview. Pipeline errors are logged to stderr.
- **Tracing**: No request IDs or correlation IDs. Matrix `event_id` values (e.g., `$abc123`) serve as natural correlation identifiers across the inbox message, the thread reply, and any created records (`matrixMessageId` column).
- **Logging Format**: Unstructured console output via `console.log` / `console.error` / `console.warn`. Emoji prefixes for visual scanning in dev.
- **Process Health**: The bot exits with code 1 on fatal startup errors (invalid env vars, migration failure). The `matrix-bot-sdk` sync loop reconnects automatically on transient network failures.

### Dependency Health

| Dependency | How the bot detects failure | Behavior on failure |
|---|---|---|
| PostgreSQL | Drizzle query throws exception | Pipeline/cron error logged; user sees error reply in thread |
| Matrix Homeserver | matrix-bot-sdk sync fails | SDK reconnects automatically; events may be delayed |
| LLM Provider (Bedrock/Anthropic) | HTTP call throws exception | Pipeline stage fails; clarification failure proceeds to classify; enrichment failure uses original fields; classification failure sends error reply |
| config.yaml | `fs.readFileSync` throws or YAML parse fails | Zod schema returns defaults (empty rooms, no users) |
