# Matrix Second Brain -- Role & Permission Refinement

## Active Roles

Global roles that interact with this application (there is only one app in the suite).

| Role | Access Level | Description (in this app's context) |
|---|---|---|
| Admin | Global | The person who bootstraps the system via `!setup`. Configures the Space, rooms, and user list. After setup, operates as a HouseholdMember for day-to-day use. |
| HouseholdMember | Owner-scoped + Shared | Day-to-day user who captures messages in their inbox room, sends messages in project rooms, shares location for proximity alerts, and reads digest summaries. |
| Bot (System) | Global (system) | Automated service that processes every incoming event, runs the AI pipeline, writes all records, manages rooms, sends digests and alerts. Not a human actor. |

## App-Specific Roles

None. The system has exactly three roles as defined at the suite level. There are no app-specific specializations.

The concept of "owner" exists (a username or `shared`) but this is a data attribute, not a role. It does not grant additional permissions -- it is used for labeling and routing (e.g., showing whose task it is in a digest).

## Permission Matrix

### InboxItem

| Operation | Admin | HouseholdMember | Bot (System) | Conditions |
|---|---|---|---|---|
| Create | Yes | Yes | Yes (on behalf of user) | Created by sending a message in an inbox room. The Bot inserts the DB record. |
| Read | No ^1 | No ^1 | Yes | Bot reads unprocessed items in enrichment cron. Users have no read access via chat. |
| Update | No | No | Yes | Bot transitions status from `new` to `processed`. |
| Delete | No | No | No | No deletion mechanism exists. |

### Task

| Operation | Admin | HouseholdMember | Bot (System) | Conditions |
|---|---|---|---|---|
| Create | Yes (indirect) | Yes (indirect) | Yes (inserts record) | Created via inbox message (AI pipeline) or project room message (project handler). |
| Read | No ^1 | No ^1 | Yes | Bot reads for daily/weekly digests and context loading. Users see tasks only in digest messages. |
| Update | No ^2 | No ^2 | No ^2 | No update handler exists. Status stays at initial value. |
| Delete | No | No | No | No deletion mechanism exists. |

### Project

| Operation | Admin | HouseholdMember | Bot (System) | Conditions |
|---|---|---|---|---|
| Create | Yes (indirect) | Yes (indirect) | Yes (inserts record + creates room) | Created via inbox message classified as `project`. |
| Read | No ^1 | No ^1 | Yes | Bot reads for weekly review, context loading. |
| Update | No ^2 | No ^2 | Yes | Bot updates `matrixRoomId` after room creation. No user-facing update path. |
| Delete | No | No | No | No deletion mechanism exists. |

### Area

| Operation | Admin | HouseholdMember | Bot (System) | Conditions |
|---|---|---|---|---|
| Create | Yes (indirect) | Yes (indirect) | Yes (inserts record) | Created via inbox message classified as `area`. |
| Read | No ^1 | No ^1 | Yes | Bot reads for context loading. |
| Update | No ^2 | No ^2 | No ^2 | No update handler exists. |
| Delete | No | No | No | No deletion mechanism exists. |

### Contact

| Operation | Admin | HouseholdMember | Bot (System) | Conditions |
|---|---|---|---|---|
| Create | Yes (indirect) | Yes (indirect) | Yes (inserts record) | Created via inbox message classified as `contact`. |
| Read | No ^1 | No ^1 | Yes | Bot reads for context loading. |
| Update | No ^2 | No ^2 | No ^2 | No update handler exists. |
| Delete | No | No | No | No deletion mechanism exists. |

### Event

| Operation | Admin | HouseholdMember | Bot (System) | Conditions |
|---|---|---|---|---|
| Create | Yes (indirect) | Yes (indirect) | Yes (inserts record) | Created via inbox message classified as `event`. |
| Read | No ^1 | No ^1 | Yes | Bot reads for daily digest. |
| Update | No ^2 | No ^2 | No ^2 | No update handler exists. |
| Delete | No | No | No | No deletion mechanism exists. |

### WaitingFor

| Operation | Admin | HouseholdMember | Bot (System) | Conditions |
|---|---|---|---|---|
| Create | Yes (indirect) | Yes (indirect) | Yes (inserts record) | Created via inbox message classified as `waiting_for`. |
| Read | No ^1 | No ^1 | Yes | Bot reads for daily digest (follow-ups due). |
| Update | No ^2 | No ^2 | No ^2 | No update handler exists. |
| Delete | No | No | No | No deletion mechanism exists. |

### Resource

| Operation | Admin | HouseholdMember | Bot (System) | Conditions |
|---|---|---|---|---|
| Create | Yes (indirect) | Yes (indirect) | Yes (inserts record) | Created via inbox message classified as `resource`. |
| Read | No ^1 | No ^1 | No | Not queried by any handler or cron. |
| Update | No ^2 | No ^2 | No ^2 | No update handler exists. |
| Delete | No | No | No | No deletion mechanism exists. |

### Note

| Operation | Admin | HouseholdMember | Bot (System) | Conditions |
|---|---|---|---|---|
| Create | Yes (indirect) | Yes (indirect) | Yes (inserts record, generates zettelId) | Created via inbox message classified as `note`. |
| Read | No ^1 | No ^1 | No | Not queried by any handler or cron. |
| Update | No ^2 | No ^2 | No ^2 | No update handler exists. |
| Delete | No | No | No | No deletion mechanism exists. |

### ShoppingItem

| Operation | Admin | HouseholdMember | Bot (System) | Conditions |
|---|---|---|---|---|
| Create | Yes (indirect) | Yes (indirect) | Yes (inserts record) | Created via inbox message classified as `shopping`. |
| Read | No ^1 | No ^1 | Yes | Bot reads pending items for proximity alerts. |
| Update | No ^2 | No ^2 | No ^2 | No status update handler exists (items stay `pending`). |
| Delete | No | No | No | No deletion mechanism exists. |

### SomedayMaybe

| Operation | Admin | HouseholdMember | Bot (System) | Conditions |
|---|---|---|---|---|
| Create | Yes (indirect) | Yes (indirect) | Yes (inserts record) | Created via inbox message classified as `someday_maybe`. |
| Read | No ^1 | No ^1 | Yes | Bot reads for weekly review (overdue review dates). |
| Update | No ^2 | No ^2 | No ^2 | No update handler exists. |
| Delete | No | No | No | No deletion mechanism exists. |

### Place

| Operation | Admin | HouseholdMember | Bot (System) | Conditions |
|---|---|---|---|---|
| Create | No ^3 | No ^3 | No ^3 | Must be seeded via direct DB access. |
| Read | No ^1 | No ^1 | Yes | Bot reads all places for proximity checks. |
| Update | No ^2 | No ^2 | No ^2 | No update path exists. |
| Delete | No | No | No | No deletion mechanism exists. |

### LocationCooldown

| Operation | Admin | HouseholdMember | Bot (System) | Conditions |
|---|---|---|---|---|
| Create | No | No | Yes | Upserted automatically on proximity alert. |
| Read | No | No | Yes | Checked before sending each alert. |
| Update | No | No | Yes | Upserted (ON CONFLICT DO UPDATE) on each alert. |
| Delete | No | No | No | No deletion/expiry mechanism; old records persist. |

### config.yaml

| Operation | Admin | HouseholdMember | Bot (System) | Conditions |
|---|---|---|---|---|
| Create/Write | Yes (via `!setup` wizard) | No | Yes (writes file on wizard completion) | Admin initiates; Bot executes the write. |
| Read | No | No | Yes | Read fresh on every incoming message. |

### Matrix Space and Rooms

| Operation | Admin | HouseholdMember | Bot (System) | Conditions |
|---|---|---|---|---|
| Create Space | Yes (via `!setup`) | No | Yes (executes creation) | One-time during setup. |
| Create Inbox Room | Yes (via `!setup`) | No | Yes (executes creation) | One per user during setup. |
| Create Digest Room | Yes (via `!setup`) | No | Yes (executes creation) | One-time during setup. |
| Create Project Room | Yes (indirect) | Yes (indirect) | Yes (executes creation) | Created when pipeline returns `newProjectRoom: true`. |
| Send Message | No ^4 | No ^4 | Yes | Only the Bot sends messages as itself. Users send messages as themselves via Matrix. |

**Footnotes**:
1. ^1 No direct read access via chat commands. Users see entity data only through bot-generated messages (confirmation replies, digest summaries, proximity alerts).
2. ^2 No update or delete mechanism is implemented in any handler. The system is currently append-only.
3. ^3 Place creation is not exposed through any handler or pipeline. Places must be inserted via direct SQL or Drizzle Studio.
4. ^4 Human users send their own messages via the Matrix client. The Bot sends messages programmatically as the bot user.

## Feature-Level Permissions

| Feature | Admin | HouseholdMember | Bot (System) | Notes |
|---|---|---|---|---|
| `!setup` wizard | Allowed | Blocked (receives error) | Executes on admin's behalf | `userId === env.ADMIN_MATRIX_ID` check |
| Inbox message capture | Allowed | Allowed | Processes and persists | Only in rooms listed in `config.yaml` `rooms.inbox` |
| Project room message | Allowed | Allowed | Saves as task | Only in rooms matching a `projects.matrix_room_id` |
| Location sharing | Allowed | Allowed | Runs proximity check | Any room; triggered by `m.location` msgtype |
| Daily digest | N/A (automated) | Receives in digest room | Generates and sends | Cron-driven, no user trigger |
| Weekly review | N/A (automated) | Receives in digest room | Generates and sends | Cron-driven, no user trigger |
| Enrichment sweep | N/A (automated) | N/A | Runs enrichment cron | Currently logs only, no re-processing |

## Data-Level Access

### Ownership Rules
- **Owner field**: Every primary entity carries an `owner` text field (a username or `shared`). This is assigned by the AI pipeline based on message content, sender identity, and the dynamic user list from `config.yaml`.
- **Ownership does not restrict access**: There is no row-level security. The Bot reads all records regardless of owner. Digest messages show all records to all users in the shared digest room.
- **CreatedBy field**: Tracks which Matrix user (by display name) captured the original message. This is informational, not used for access control.

### Row-Level Security Rules

| Rule | Applies To | Logic |
|---|---|---|
| Inbox room isolation | InboxItem creation | Each user can only send messages to their own inbox room (enforced by Matrix room membership, not application code). |
| Proximity alert routing | Location alerts | Alerts are sent to the room where the location event was received, visible to whoever sent the location. |
| Digest visibility | All digest data | All users in the digest room see all digest content regardless of `owner`. No filtering by owner. |

### Status-Based Visibility

No status-based visibility rules exist. All records are visible to the Bot regardless of status. Users do not have direct query access.

## Role-Based Interaction Variations

Since there is no UI, this section describes how the bot's behavior varies by role.

### Admin-Only Interactions
- The `!setup` command is gated to the admin. Non-admin users receive: "Only the admin can run `!setup`."
- No other admin-exclusive interactions exist after setup is complete.

### HouseholdMember Interactions
- All HouseholdMembers have identical interaction capabilities: inbox capture, project room messaging, location sharing, digest reading.
- The `owner` field on records provides informational labeling but does not restrict any interaction.

### Bot Behavior by Context
- **Inbox room**: Runs full AI pipeline (clarify -> classify -> enrich -> write -> reply).
- **Project room**: Skips AI pipeline; saves message directly as a Task.
- **Any room with location event**: Runs proximity check.
- **Digest room**: Sends cron-generated summaries; does not process incoming messages.
- **Other rooms**: Ignores messages (falls through all routing checks).
