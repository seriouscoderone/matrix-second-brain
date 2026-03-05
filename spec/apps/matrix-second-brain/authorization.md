# Matrix Second Brain -- Authorization Policy

## Policy Overview

- **Model**: Hybrid -- primarily RBAC (two human roles: Admin and HouseholdMember) with attribute-based conditions for specific rules (room membership, owner field, startup timestamp).
- **Role Hierarchy**: Admin inherits all HouseholdMember capabilities. The Bot role is orthogonal (system actor, not a human role).
- **Multi-Role**: No. A user is either the Admin (who also acts as a HouseholdMember) or a HouseholdMember. There is no role assignment mechanism -- roles are determined by configuration (`ADMIN_MATRIX_ID` in `.env`; user list in `config.yaml`).
- **Scope**: Global. There is no per-organization, per-project, or per-team scoping. The `owner` field on records is informational, not an access control boundary.
- **Default Deny**: Yes. The bot ignores all events that do not match a specific routing rule. Messages in unrecognized rooms, non-text message types (except location), and events from before `startupTs` are silently dropped.

---

## Roles Summary

| Role | Description | Inherits From |
|---|---|---|
| Admin | System administrator who can run the `!setup` wizard. Also functions as a HouseholdMember for day-to-day use. | HouseholdMember |
| HouseholdMember | Day-to-day user who captures messages, receives digests, and gets proximity alerts. | -- |
| Bot (System) | Automated service account. Processes events, runs pipeline, writes records, manages rooms, sends messages. Not a human role -- included for completeness. | -- |

---

## Event-Level Policies (replaces Route-Level)

Since there are no HTTP routes, authorization is enforced at the Matrix event handling level. Each event type has an access policy.

| Event / Command | Allowed Roles | Additional Conditions | Denied Behavior |
|---|---|---|---|
| `!setup` command | Admin only | `userId === env.ADMIN_MATRIX_ID` | Bot replies: "Only the admin can run `!setup`." |
| Wizard reply (during setup) | Admin only | `isInSetup(userId) === true` (only the user who started the wizard) | Not routed to wizard handler; falls through to other handlers |
| Inbox message (m.text) | Any HouseholdMember | Room must be in `config.yaml` `rooms.inbox` values; enforced by Matrix room membership (private rooms) | Message is silently ignored (falls through routing) |
| Project room message (m.text) | Any HouseholdMember | Room must match a `projects.matrix_room_id` in DB; enforced by Matrix room membership | Message is silently ignored |
| Location event (m.location) | Any HouseholdMember | Valid `geo_uri` or MSC3488 location; any room | Invalid geo_uri is logged and ignored |
| Daily/weekly digest | Bot only (automated) | Cron-triggered; no user invocation | N/A -- cron runs regardless of user action |
| Enrichment cron | Bot only (automated) | Cron-triggered | N/A |

### Detailed Enforcement

#### `!setup` Command
```
Command: !setup
  Enforcement point: wizard.ts handleSetupCommand()
  Check: userId === env.ADMIN_MATRIX_ID
  If denied: Send error message "Only the admin can run !setup."
  If allowed: Initialize wizard state, send first prompt
  Audit: console.log with userId
```

#### Inbox Message Processing
```
Event: m.text in inbox room
  Enforcement point: bot/index.ts message router
  Check 1: origin_server_ts >= startupTs (replay protection)
  Check 2: sender !== env.MATRIX_BOT_USER_ID (self-message filter)
  Check 3: roomId in loadConfigYaml().rooms.inbox values
  Check 4: Matrix room membership (enforced by homeserver -- only members can send)
  If all pass: Route to handleInboxMessage()
  If any fail: Silently dropped (no error message)
```

#### Project Room Message
```
Event: m.text in project room
  Enforcement point: bot/index.ts message router
  Check 1: origin_server_ts >= startupTs
  Check 2: sender !== env.MATRIX_BOT_USER_ID
  Check 3: getProjectByRoomId(db, roomId) returns a project
  Check 4: Matrix room membership (enforced by homeserver)
  If all pass: Route to handleProjectMessage()
  If any fail: Silently dropped
```

#### Location Event
```
Event: m.location
  Enforcement point: bot/index.ts message router
  Check 1: origin_server_ts >= startupTs
  Check 2: sender !== env.MATRIX_BOT_USER_ID
  Check 3: Valid geo_uri parsed from event content
  If all pass: Route to handleLocationEvent()
  If geo_uri invalid: Log warning, silently dropped
```

---

## Service-Level Policies (replaces API-Level)

Since there are no API endpoints, authorization is enforced at internal service function boundaries.

| Service Function | Invoking Role | Conditions | Denied Behavior |
|---|---|---|---|
| `processCapturedMessage()` | Bot (on behalf of HouseholdMember) | Called only from handleInboxMessage after routing checks pass | N/A -- only invoked if routing passes |
| `writeRecord()` | Bot | Called only from pipeline after classification succeeds | Throws if category is unknown |
| `createProjectRoom()` | Bot | Called when pipeline returns `newProjectRoom = true` | Room creation error is caught and logged |
| `createSpace()` | Bot (on behalf of Admin) | Called only during wizard completion | Error propagates to wizard error handler |
| `checkProximityAndAlert()` | Bot | Called only from location handler after geo_uri parsing | Alerts suppressed by cooldown check |
| `saveConfigYaml()` | Bot (on behalf of Admin) | Called only on wizard completion | Error propagates to wizard error handler |
| `loadConfigYaml()` | Bot | Called on every incoming message; no authorization required | Returns defaults if file doesn't exist |

---

## Data-Level Policies

### Row-Level Security

**There is no row-level security enforcement.** The application does not restrict which records a user can see. All enforcement is at the event-routing level (which room a user is in), not at the data level.

| Entity | Policy | Description |
|---|---|---|
| All entities | No row-level filtering | The Bot reads all records regardless of `owner`. Digest messages show all items to all users in the digest room. |
| InboxItem | Room-scoped creation | Each user can only create InboxItems by sending messages in their own inbox room (enforced by Matrix room membership). |
| ShoppingItem | Alert-scoped | Proximity alerts are sent to the user who shared their location, but show items from all owners. |

### Field-Level Security

**There is no field-level security.** All fields of all entities are readable by the Bot. Users never directly access entity data -- they only see bot-generated summaries (digests, confirmations, alerts).

### Ownership Model

The `owner` field (a username or `shared`) is an informational attribute, not an access control mechanism:

| Aspect | Behavior |
|---|---|
| **Assignment** | Set by the AI pipeline during classification, based on message content and sender. |
| **Visibility** | Shown in digest messages (e.g., "task (alice)") for accountability. No filtering by owner. |
| **Modification** | No mechanism to change owner after creation. |
| **Access control** | Owner field does not restrict any operation. Alice can see Bob's tasks in the digest; Bob can see Alice's. |
| **Default** | `shared` for shopping, contacts, and projects (unless message clearly indicates one person). |

---

## Matrix-Level Access Control

The Matrix protocol provides the primary access control layer. The bot relies on Matrix room membership for authorization:

| Control | Enforcement | Description |
|---|---|---|
| Room membership | Matrix homeserver | Only room members can send events in private rooms (`preset: private_chat`). Non-members cannot access inbox rooms or project rooms. |
| Room creation | Bot (room creator) | The bot creates all rooms during wizard and project creation. Only configured users are invited. |
| Space membership | Matrix homeserver | The Space groups rooms. Room membership is separate from Space membership. |
| Admin privileges | `.env` config | `ADMIN_MATRIX_ID` is the sole admin. This is a static configuration, not a dynamic role. |
| Bot identity | `.env` config | `MATRIX_BOT_USER_ID` and `MATRIX_BOT_ACCESS_TOKEN` identify the bot. The bot auto-joins all rooms it is invited to (`AutojoinRoomsMixin`). |

---

## Escalation & Override Paths

### Admin Override
The admin has no special override capabilities beyond the `!setup` command. After setup, the admin functions identically to any HouseholdMember. There is no "admin mode", impersonation, or elevated access for data operations.

### Direct Database Access
The only "escalation path" is direct database access via Drizzle Studio (`npm run db:studio`) or raw SQL. This bypasses all application-level controls. This is by design for a small-household system where the admin is also the system operator.

### No Impersonation
There is no impersonation or "act as" feature. The bot always identifies users by their Matrix sender ID.

### No Temporary Elevation
There is no mechanism to grant temporary elevated access.

### Audit Trail
- **Console logging**: All incoming events are logged with sender, room, and content preview.
- **InboxItem**: Raw message content is preserved in the `inbox_items` table with `createdBy` and `matrixMessageId`.
- **Entity records**: All records carry `createdBy`, `createdAt`, and `matrixMessageId` for traceability back to the original Matrix event.
- **No structured audit log**: There is no dedicated audit table. Audit information is distributed across entity records and console output.

---

## Security Boundaries Summary

```
[Matrix Homeserver]
  |
  | Room membership controls who can send events
  |
[Bot Process]
  |
  +-- Startup timestamp filter (replay protection)
  +-- Self-message filter (loop prevention)
  +-- Admin check (wizard only)
  +-- Room-based routing (inbox vs. project vs. other)
  +-- Cooldown check (proximity alert rate limiting)
  |
[PostgreSQL Database]
  |
  +-- No row-level security
  +-- FK constraints enforce referential integrity
  +-- NOT NULL constraints enforce required fields
  +-- UNIQUE constraint on notes.zettel_id
  +-- Enum constraints on status, priority, context, etc.
```

The security model is intentionally minimal, appropriate for a trusted-household deployment where all users are known and trust each other. The primary risk mitigations are:
1. Matrix room membership prevents unauthorized message injection.
2. Replay protection prevents historical event re-processing.
3. Admin-only wizard prevents unauthorized system reconfiguration.
4. Cooldown mechanism prevents proximity alert spam.
