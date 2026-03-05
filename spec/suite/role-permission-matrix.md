# Role & Permission Matrix -- Matrix Second Brain

## Role Definitions

This system has no traditional web-based authentication or user management. Identity and access are entirely delegated to the Matrix protocol -- users authenticate with their Matrix homeserver, and the bot identifies them by their Matrix user ID (e.g., `@alice:localhost`). Roles are implicit, determined by configuration and room membership.

| Role | Description | Typical User | Access Level | Notes |
|---|---|---|---|---|
| **Admin** | The system administrator who bootstraps the bot via the `!setup` wizard. Has exclusive access to system configuration. | The person whose Matrix ID matches `ADMIN_MATRIX_ID` in `.env` | Global | Only one admin exists. Can also act as a HouseholdMember. |
| **HouseholdMember** | A user listed in `config.yaml` `users[]` who has a personal inbox room and participates in shared project rooms. Captures messages and receives digests. | Alice or Bob (or anyone invited during setup) | Owner-scoped + Shared | Each member has their own inbox room. Sees shared records and records owned by their own alias. |
| **Bot** | The automated service account that processes messages, runs the AI pipeline, manages rooms, and sends digests/alerts. Not a human actor but an important system role. | The bot process (`MATRIX_BOT_USER_ID`) | Global (system) | Creates rooms, writes all DB records, sends all bot messages. Cannot be invoked by external callers except through Matrix events. |

### Notes on the `owner` model

The system does not have fine-grained per-user permissions. Instead, every record carries an `owner` text field set to a username (e.g., `alice`, `joseph`) or `shared`. The owner is assigned by the AI pipeline based on message content, sender, and the dynamic user list from `config.yaml`. There is no enforcement preventing one user from reading records owned by another -- the database has no row-level security. The `owner` field is used for:
- Routing digest information (e.g., showing a user their own tasks)
- Proximity alerts (routed to the user who sent the location event)
- Display labeling (showing who a task belongs to)

---

## Permission Matrix

Since all database writes go through the Bot (either via the AI pipeline or the project room handler), and all human interaction is mediated through Matrix rooms, the permission matrix describes what actions each role can trigger via chat messages.

| Entity / Operation | Admin | HouseholdMember | Bot (System) |
|---|---|---|---|
| **InboxItem** / Create | Via inbox room message | Via inbox room message | Inserts DB record on behalf of user |
| **InboxItem** / Read | - ^1 | - ^1 | R (queries unprocessed items in enrichment cron) |
| **InboxItem** / Update | - | - | U (marks as processed) |
| **InboxItem** / Delete | - | - | - |
| **Task** / Create | Via inbox or project room | Via inbox or project room | Inserts DB record via pipeline or project handler |
| **Task** / Read | - ^1 | - ^1 | R (queries for daily/weekly digests) |
| **Task** / Update | - ^2 | - ^2 | - ^2 |
| **Task** / Delete | - | - | - |
| **Project** / Create | Via inbox room | Via inbox room | Inserts DB record + creates Matrix room |
| **Project** / Read | - ^1 | - ^1 | R (queries for weekly review, context loading) |
| **Project** / Update | - ^2 | - ^2 | U (updates `matrixRoomId` after room creation) |
| **Project** / Delete | - | - | - |
| **Area** / Create | Via inbox room | Via inbox room | Inserts DB record via pipeline |
| **Area** / Read | - ^1 | - ^1 | R (queries for context loading) |
| **Area** / Update | - ^2 | - ^2 | - ^2 |
| **Area** / Delete | - | - | - |
| **Contact** / Create | Via inbox room | Via inbox room | Inserts DB record via pipeline |
| **Contact** / Read | - ^1 | - ^1 | R (queries for context loading) |
| **Contact** / Update | - ^2 | - ^2 | - ^2 |
| **Contact** / Delete | - | - | - |
| **Event** / Create | Via inbox room | Via inbox room | Inserts DB record via pipeline |
| **Event** / Read | - ^1 | - ^1 | R (queries for daily digest) |
| **Event** / Update | - ^2 | - ^2 | - ^2 |
| **Event** / Delete | - | - | - |
| **WaitingFor** / Create | Via inbox room | Via inbox room | Inserts DB record via pipeline |
| **WaitingFor** / Read | - ^1 | - ^1 | R (queries for daily digest follow-ups) |
| **WaitingFor** / Update | - ^2 | - ^2 | - ^2 |
| **WaitingFor** / Delete | - | - | - |
| **Resource** / Create | Via inbox room | Via inbox room | Inserts DB record via pipeline |
| **Resource** / Read | - ^1 | - ^1 | - |
| **Resource** / Update | - ^2 | - ^2 | - ^2 |
| **Resource** / Delete | - | - | - |
| **Note** / Create | Via inbox room | Via inbox room | Inserts DB record via pipeline (generates zettelId) |
| **Note** / Read | - ^1 | - ^1 | - |
| **Note** / Update | - ^2 | - ^2 | - ^2 |
| **Note** / Delete | - | - | - |
| **ShoppingItem** / Create | Via inbox room | Via inbox room | Inserts DB record via pipeline |
| **ShoppingItem** / Read | - ^1 | - ^1 | R (queries pending items for proximity alerts) |
| **ShoppingItem** / Update | - ^2 | - ^2 | - ^2 |
| **ShoppingItem** / Delete | - | - | - |
| **SomedayMaybe** / Create | Via inbox room | Via inbox room | Inserts DB record via pipeline |
| **SomedayMaybe** / Read | - ^1 | - ^1 | R (queries for weekly review) |
| **SomedayMaybe** / Update | - ^2 | - ^2 | - ^2 |
| **SomedayMaybe** / Delete | - | - | - |
| **Place** / Create | - ^3 | - ^3 | - ^3 |
| **Place** / Read | - ^1 | - ^1 | R (queries all places for proximity checks) |
| **Place** / Update | - ^2 | - ^2 | - ^2 |
| **Place** / Delete | - | - | - |
| **LocationCooldown** / Create | - | - | C (upserted on proximity alert) |
| **LocationCooldown** / Read | - | - | R (checked before sending alert) |
| **LocationCooldown** / Update | - | - | U (upserted on proximity alert) |
| **LocationCooldown** / Delete | - | - | - |
| **config.yaml** / Write | Via `!setup` wizard | - | Writes file on wizard completion |
| **config.yaml** / Read | - | - | R (loaded fresh on every message) |
| **Matrix Space** / Create | Via `!setup` wizard | - | Creates Space room on wizard completion |
| **Inbox Room** / Create | Via `!setup` wizard | - | Creates room per user on wizard completion |
| **Project Room** / Create | Via inbox message (triggers pipeline) | Via inbox message (triggers pipeline) | Creates room when pipeline returns `newProjectRoom: true` |
| **Digest Room** / Create | Via `!setup` wizard | - | Creates room on wizard completion |
| **Location Event** / Send | Send `m.location` in any room | Send `m.location` in any room | Processes event, runs proximity check |

**Footnotes**:
1. ^1 No direct read access via chat. Users see records only through bot-generated responses (confirmation messages, digest summaries, proximity alerts). Direct DB reads require Drizzle Studio or SQL.
2. ^2 No update/delete mechanism exists in the current implementation. The system is append-only for all user-facing entities. Updates would require a future command parser or additional LLM intents.
3. ^3 Place creation is not implemented in the AI pipeline or any handler. Places must be inserted directly into the database (e.g., via Drizzle Studio or SQL).

---

## Data Visibility Rules

### Admin
- **Scope**: Global. Can see all records regardless of `owner` field (via digests and database access).
- **Filters**: Daily digest shows all tasks/events/follow-ups. Weekly review shows all stale projects and overdue items.
- **Hidden Fields**: None.
- **Export**: No export mechanism exists in the bot. Database access via Drizzle Studio provides full export capability.

### HouseholdMember
- **Scope**: Owner-scoped in practice. Users primarily see records through bot responses in their own inbox room (confirmation messages) and the shared digest room.
- **Filters**: Proximity alerts are scoped to the user who sent the location event. Digest messages are sent to the shared digest room and include owner labels but are visible to all members.
- **Hidden Fields**: None at the application level. All members in the digest room see the same digest content.
- **Export**: No export mechanism exists.

### Bot (System)
- **Scope**: Global. The bot has full database access and reads all records for context loading, digest generation, and proximity checks.
- **Filters**: Context loader limits pending tasks to 20 (performance guard). Enrichment cron filters for items older than 5 minutes.
- **Hidden Fields**: N/A (system role).
- **Export**: N/A.

---

## Role Hierarchy

```
Admin
  |
  +-- Has all HouseholdMember capabilities
  +-- Exclusive: !setup wizard, config.yaml writes
  |
HouseholdMember
  |
  +-- Can capture messages in their inbox room
  +-- Can send messages in project rooms (creates tasks)
  +-- Can share location (triggers proximity alerts)
  +-- Receives digest messages in shared digest room
  |
Bot (System)
  |
  +-- Orthogonal to human roles (automated service account)
  +-- Full DB read/write (delegated by human actions)
  +-- Room management (create, invite, send messages)
  +-- Cron job execution
```

There is no formal role inheritance mechanism. The Admin role is a superset of HouseholdMember in terms of capabilities. The Bot role is a system-level actor that executes on behalf of human users.

Custom roles are not supported. The `owner` field is a dynamic text value derived from the user list in `config.yaml`.

---

## Authentication Requirements

| Role | Auth Method | MFA Required | Session Timeout | IP Restrictions | Audit Level |
|---|---|---|---|---|---|
| **Admin** | Matrix homeserver authentication (password or SSO depending on homeserver config) | Depends on homeserver policy | Matrix session token (long-lived, managed by homeserver) | None (homeserver-level) | Bot logs all `!setup` commands with userId |
| **HouseholdMember** | Matrix homeserver authentication | Depends on homeserver policy | Matrix session token | None (homeserver-level) | Bot logs all incoming messages with sender and room ID |
| **Bot** | Access token (`MATRIX_BOT_ACCESS_TOKEN` in `.env`) | N/A | Token does not expire unless revoked | None | Console logging of all events, pipeline results, and errors |

### Notes

- All authentication is delegated to the Matrix homeserver. The bot trusts the Matrix protocol to verify user identity.
- The bot identifies users by their full Matrix ID (`@username:server`). There is no additional authentication layer.
- The bot's own access token is a long-lived credential stored in `.env`. It should be treated as a secret and rotated if compromised.
- There is no session management within the bot itself. The bot processes each Matrix event independently.
- Audit logging is limited to `console.log`/`console.error` statements. There is no structured audit trail or persistent log storage beyond what the deployment platform provides.
