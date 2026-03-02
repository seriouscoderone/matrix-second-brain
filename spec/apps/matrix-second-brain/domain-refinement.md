# Matrix Second Brain -- Domain Refinement

## Owned Entities

This is a single-app system -- all entities are owned by this application. There are no external apps.

| Entity | Operations | Lifecycle | Notes |
|---|---|---|---|
| InboxItem | Create, Read, Update | `new` -> `processed` -> `archived` | Created on every inbox message. Updated to `processed` after pipeline completes. |
| Task | Create, Read | `pending` -> `in_progress` -> `done` | Created by AI pipeline (from inbox) or project room handler. No update/delete via chat yet. |
| Project | Create, Read, Update | `active` -> `on_hold` -> `completed` -> `archived` | Created by AI pipeline. `matrixRoomId` updated after room creation. |
| Area | Create, Read | Always active (no end date) | Created by AI pipeline. `lastReviewedAt` updatable but no handler exists. |
| Contact | Create, Read | No lifecycle states | Created by AI pipeline. |
| Event | Create, Read | Implicitly upcoming -> past (based on `startAt`) | Created by AI pipeline. |
| EventAttendee | (unused) | N/A | Join table exists but is never written to by current code. |
| WaitingFor | Create, Read | Implicitly open until deleted | Created by AI pipeline. |
| Resource | Create, Read | No lifecycle states | Created by AI pipeline. |
| Note | Create, Read | No lifecycle states | Created by AI pipeline. Zettel ID auto-generated. |
| NoteLink | (unused) | N/A | Join table exists but is never written to by current code. |
| ShoppingItem | Create, Read | `pending` -> `purchased` | Created by AI pipeline. Read by proximity engine. No status update handler. |
| SomedayMaybe | Create, Read | No explicit states; surfaced when `reviewDate` is past | Created by AI pipeline. |
| Place | Read | No lifecycle states | Read-only in application code. Must be seeded via direct DB access. |
| LocationCooldown | Create, Update, Read | Upserted on each proximity alert | System-managed. No user interaction. |

### Entity Details

#### InboxItem
- **Key attributes**: `rawContent` (required), `captureSource` (room ID), `status` (new/processed/archived), `createdBy`, `matrixMessageId`
- **Required fields**: `rawContent`, `captureSource`, `createdBy`
- **App-specific behavior**: Created immediately on message receipt, before the pipeline runs. Serves as an audit trail of raw input. The enrichment cron queries unprocessed items older than 5 minutes.

#### Task
- **Key attributes**: `title` (required), `description`, `status`, `priority`, `context`, `dueDate`, `projectId`, `areaId`, `matrixMessageId`
- **Required fields**: `title`, `owner`, `createdBy`
- **Creation paths**: (1) AI pipeline classifies an inbox message as `task`; (2) User sends any message in a project room (auto-saved as task with project link)
- **App-specific behavior**: Tasks in project rooms inherit the project's owner if the project is shared.

#### Project
- **Key attributes**: `name` (required), `description`, `status`, `outcome`, `nextAction`, `deadline`, `matrixRoomId`, `areaId`, `visibility`
- **Required fields**: `name`, `owner`, `createdBy`
- **App-specific behavior**: When created, triggers Matrix room creation. The `matrixRoomId` is updated after room creation succeeds. Stale projects (active 14+ days, no `nextAction`) are surfaced in weekly review.

#### ShoppingItem
- **Key attributes**: `item` (required), `quantity`, `estimatedCost`, `whereToBuy`, `urgency`, `status`, `placeId`, `projectId`
- **Required fields**: `item`, `owner`, `createdBy`
- **App-specific behavior**: Linked to a Place via `placeId` for proximity alerts. The proximity engine queries `pending` items only.

#### Place
- **Key attributes**: `name` (required), `lat` (required), `lon` (required), `address`, `tags`
- **Required fields**: `name`, `lat`, `lon`, `owner`, `createdBy`
- **App-specific behavior**: Not created by any handler or pipeline. Must be pre-seeded in the database. Used by the proximity engine to match against user locations.

#### Note
- **Key attributes**: `zettelId` (unique, auto-generated), `title` (required), `content` (required), `tags`, `projectId`
- **Required fields**: `zettelId`, `title`, `content`, `owner`, `createdBy`
- **App-specific behavior**: `zettelId` is generated as `YYYYMMDDHHmmss` timestamp. The NoteLink table exists for Zettelkasten-style linking but is not populated by any code path.

#### LocationCooldown
- **Key attributes**: `userId`, `placeId`, `lastAlertedAt`
- **Required fields**: All three
- **App-specific behavior**: Composite PK on (userId, placeId). Upserted (insert or update on conflict) after each proximity alert. Queried to suppress alerts within the cooldown window.

## Referenced Entities

N/A -- single-app system. All entities are owned.

## App-Specific Entities

No entities beyond those in the suite domain model.

## Entity Relationship Diagram

```
Area ──1:N──> Project
Area ──1:N──> Task

Project ──1:N──> Task
Project ──1:N──> WaitingFor
Project ──1:N──> ShoppingItem
Project ──1:N──> Note

Contact ──1:N──> WaitingFor
Contact <──M:N──> Event  (via EventAttendee)

Place ──1:N──> ShoppingItem
Place ──1:N──> LocationCooldown

Note <──M:N──> Note  (via NoteLink, self-referential)

InboxItem  (standalone -- consumed by pipeline, produces one of the above)
SomedayMaybe  (standalone)
Resource  (standalone)
```

## App-Specific Business Rules

1. **Inbox isolation**: Each user has their own inbox room. Messages in one user's inbox are processed independently and attributed to that user via `createdBy`.
2. **Pipeline atomicity**: The AI pipeline processes one message at a time (no batching). If the pipeline fails at any stage, the error is reported in-thread and the InboxItem remains in `new` status for potential retry by the enrichment cron.
3. **Project room auto-creation**: When the pipeline classifies a message as `project`, a dedicated Matrix room is automatically created, added to the Space, and linked to the project record via `matrixRoomId`.
4. **Project room routing**: Any message sent in a room matching a `projects.matrix_room_id` is saved as a Task linked to that project. No AI classification is performed -- the message text becomes the task title directly.
5. **Proximity alert suppression**: A user is not alerted about the same Place more than once within `LOCATION_COOLDOWN_MINUTES` (default 120). The cooldown is per-user, per-place.
6. **Proximity alert relevance**: Alerts only fire when the nearby Place has at least one ShoppingItem with `status = 'pending'`. If all items are purchased, no alert is sent.
7. **Clarification is single-round**: The bot asks clarifying questions at most once per message. If the user replies, the original message and clarification are merged and re-classified (skipping the clarification stage). There is no multi-round clarification.
8. **Owner assignment by AI**: The LLM decides the `owner` value based on message content and sender. Default is `shared` for shopping, contacts, and projects. Personal items (containing "I need to" etc.) are assigned to the sender.
9. **Config must be re-read**: `config.yaml` is read fresh on every incoming message to pick up changes from the setup wizard. The cached `config` export must not be used for routing decisions.
10. **Historical event replay protection**: Events with `origin_server_ts` before the bot's `startupTs` are silently dropped to prevent re-processing on restart.

## Data Lifecycle

### Creation
- **InboxItem**: Created on every message in an inbox room, before pipeline processing.
- **Domain entities** (Task, Project, etc.): Created by the AI pipeline after classification and enrichment, or by the project room handler (Task only).
- **Place**: Must be seeded manually via direct database access.
- **LocationCooldown**: Created automatically on first proximity alert for a user+place pair.
- **config.yaml**: Written once by the setup wizard.

### Active State
- **InboxItem**: Transitions from `new` to `processed` after the pipeline completes. Remains queryable for the enrichment cron.
- **Task**: Transitions through `pending` -> `in_progress` -> `done`. Currently no handler to trigger transitions; status stays `pending` after creation.
- **Project**: Can transition through `active` -> `on_hold` -> `completed` -> `archived`. Currently no handler to trigger transitions; status stays `active` after creation.
- **ShoppingItem**: Can transition from `pending` to `purchased`. Currently no handler; stays `pending`.
- **All other entities**: Remain in their initial state after creation.

### Archival / Deletion
- **No deletion mechanism exists.** The system is append-only. No handler, command, or cron job deletes or archives records.
- **InboxItem**: Can be archived (`archived` status) but no code path triggers this transition.
- **Soft delete pattern**: Not implemented. If added, would use status field transitions rather than hard deletes (preserving audit trail).
- **Retention policy**: None defined. All records persist indefinitely.

### Cross-App Sync
N/A -- single-app system.
