# Domain Model -- Matrix Second Brain

## Business Context

- **Industry**: Personal productivity / Knowledge management
- **Problem Statement**: People capture thoughts, tasks, ideas, contacts, and reference material across many tools but lack a unified system to process, organize, and resurface them. Households sharing responsibilities (e.g., a couple) need a shared GTD system that routes items to the right person and reminds them at the right time and place.
- **Value Proposition**: A single chat-based interface (Matrix) powered by an LLM pipeline that automatically classifies free-text messages into structured GTD categories, persists them in a relational database, creates dedicated project rooms, delivers daily/weekly digests, and sends proximity-based shopping reminders -- all without leaving the Matrix messaging client.
- **Target Users**: A small household (currently modeled as two people, Alice and Bob) who interact with the bot through Matrix chat rooms. One user is the admin who bootstraps the system; all users capture and consume information through personal inbox rooms.
- **Compliance Requirements**: None identified. The system processes only data its users intentionally send to it. No PII regulations apply beyond standard data-at-rest security for the PostgreSQL database.
- **Existing Systems**: Greenfield. The bot integrates with the Matrix protocol (via matrix-bot-sdk) and optionally with AWS Bedrock or the Anthropic API for LLM inference. No legacy system is being replaced.

---

## Entity Glossary

| Entity | Description | Key Attributes | Lifecycle States | Relationships |
|---|---|---|---|---|
| **InboxItem** | A raw, unprocessed message captured from a user's inbox room. Serves as the entry point for the AI pipeline. | `rawContent` (text, required), `captureSource` (room ID), `status`, `createdBy`, `matrixMessageId` | `new` -> `processed` -> `archived` | Standalone; consumed by the AI pipeline which produces one of the other entities |
| **Task** | A concrete next action someone needs to perform. The fundamental GTD work unit. | `title` (required), `description`, `status`, `priority` (low/medium/high), `context` (home/work/errands/phone/computer/waiting), `dueDate`, `matrixMessageId` | `pending` -> `in_progress` -> `done` | belongs to **Project** (optional), belongs to **Area** (optional), owned by an **Owner** |
| **Project** | A multi-step outcome requiring more than one action. Gets its own Matrix room for threaded discussion. | `name` (required), `description`, `status`, `outcome`, `nextAction`, `deadline`, `matrixRoomId`, `visibility` (shared/personal) | `active` -> `on_hold` -> `completed` -> `archived` | belongs to **Area** (optional), has many **Task**, has many **WaitingFor**, has many **ShoppingItem**, has many **Note** |
| **Area** | An ongoing area of responsibility with maintenance standards (e.g., Health, Finance, Home). Not a project -- has no end date. | `name` (required), `description`, `successCriteria`, `reviewFrequency` (weekly/monthly/quarterly), `lastReviewedAt` | No explicit lifecycle states; always active | has many **Project**, has many **Task** |
| **Contact** | A person the household interacts with. Linked to events and waiting-for items. | `name` (required), `relationship`, `company`, `email`, `phone`, `lastInteractionAt`, `followUpDate`, `notes` | No explicit lifecycle states | referenced by **EventAttendee**, referenced by **WaitingFor** |
| **Event** | A time-bound occurrence: meeting, appointment, dinner, etc. | `title` (required), `startAt` (required), `endAt`, `location`, `notes`, `matrixMessageId` | No explicit lifecycle states (implicitly: upcoming -> past, based on `startAt`) | has many **Contact** (through **EventAttendee**) |
| **EventAttendee** | Join table linking Events to Contacts. | `eventId` (required), `contactId` (required) | N/A (join record) | belongs to **Event**, belongs to **Contact** |
| **WaitingFor** | Something delegated to or expected from another person. A GTD tracking item for dependencies. | `title` (required), `context`, `followUpDate`, `matrixMessageId` | No explicit status enum; implicitly open until deleted | belongs to **Contact** (optional), belongs to **Project** (optional) |
| **Resource** | A reference to external content: articles, books, videos, podcasts, papers. | `title` (required), `url`, `sourceType` (article/book/podcast/video/paper/other), `author`, `keyTakeaways`, `tags` (array) | No explicit lifecycle states | Standalone |
| **Note** | A Zettelkasten-style atomic note. Identified by a timestamp-based zettelId for permanent linking. | `zettelId` (unique, required), `title` (required), `content` (required), `tags` (array), `matrixMessageId` | No explicit lifecycle states | belongs to **Project** (optional), has many **Note** (via **NoteLink** -- bidirectional graph) |
| **NoteLink** | Directed edge in the Zettelkasten note graph. | `fromNoteId` (required), `toNoteId` (required) | N/A (join record) | belongs to **Note** (from), belongs to **Note** (to) |
| **ShoppingItem** | An item to buy or acquire, optionally linked to a physical place for proximity alerts. | `item` (required), `quantity`, `estimatedCost`, `whereToBuy`, `urgency` (low/medium/high), `status`, `matrixMessageId` | `pending` -> `purchased` | belongs to **Place** (optional), belongs to **Project** (optional) |
| **SomedayMaybe** | A wish, dream, or future possibility not yet actionable. Reviewed periodically. | `title` (required), `description`, `category`, `reviewDate`, `tags` (array), `matrixMessageId` | No explicit lifecycle states; surfaced by weekly review when `reviewDate` is past | Standalone |
| **Place** | A named geographic location with coordinates. Used for proximity-based shopping alerts. | `name` (required), `lat` (required), `lon` (required), `address`, `tags` (array) | No explicit lifecycle states | has many **ShoppingItem**, referenced by **LocationCooldown** |
| **LocationCooldown** | Tracks when a user was last alerted about a specific place, to prevent alert spam. | `userId` (required), `placeId` (required), `lastAlertedAt` (required) | N/A (upserted on each alert) | belongs to **Place** |

### Cross-cutting attributes

Every primary entity (except join tables and LocationCooldown) carries:
- `id` -- UUID, auto-generated primary key
- `owner` -- text string (any username, or `'shared'`) -- who owns this record
- `createdBy` -- text string of the Matrix display name who captured it
- `createdAt` -- timestamp, auto-generated

---

## Domain Event Catalog

| Event Name | Trigger | Producer Entity | Consumer(s) | Payload Summary |
|---|---|---|---|---|
| `InboxMessageReceived` | User sends a text message in their inbox room | Matrix room event | InboxHandler, InboxItem writer | `roomId`, `eventId`, `userId`, `textContent` |
| `ClarificationRequested` | AI pipeline determines the message is ambiguous (confidence > 0.5 for needsClarification) | AI Pipeline (Stage 1) | InboxHandler (sends thread reply, stores pending state) | `userId`, `roomId`, `originalEventId`, `questions[]`, `originalMessage` |
| `ClarificationReceived` | User replies in the inbox room while a pending clarification exists for them | InboxHandler | AI Pipeline (re-enters at Stage 3 with merged context) | `userId`, `roomId`, `originalMessage`, `clarificationText` |
| `MessageClassified` | AI pipeline classifies and extracts fields from an inbox message | AI Pipeline (Stage 3) | DB writer (Stage 5) | `category`, `confidence`, `owner`, `createdBy`, `fields{}` |
| `RecordCreated` | A new entity is written to the database after enrichment | AI Pipeline (Stage 5) | InboxHandler (sends confirmation reply) | `category`, `recordId`, `title`, `owner` |
| `ProjectCreated` | A new Project record is written, triggering Matrix room creation | AI Pipeline (Stage 5) | InboxHandler (calls createProjectRoom, updates matrixRoomId) | `projectId`, `projectName`, `members[]`, `spaceId` |
| `ProjectRoomMessageReceived` | User sends a text message in a project room | Matrix room event | ProjectHandler | `roomId`, `eventId`, `userId`, `textContent`, `projectId` |
| `TaskAddedToProject` | A message in a project room is saved as a task linked to that project | ProjectHandler | DB (tasks table insert) | `taskId`, `title`, `projectId`, `owner`, `createdBy` |
| `LocationEventReceived` | User shares a live location (m.location msgtype or MSC3488) | Matrix room event | LocationHandler | `userId`, `roomId`, `geoUri` (lat, lon) |
| `ProximityAlertTriggered` | User's location is within ALERT_RADIUS_METERS of a Place with pending ShoppingItems, and cooldown has expired | Proximity engine | LocationHandler (sends alert message) | `userId`, `placeName`, `distanceMeters`, `items[]` |
| `DailyDigestGenerated` | Cron job fires at configured schedule (default 08:00 daily) | DailyCron | Digest room (via sendMessage) | `tasksDueToday[]`, `eventsToday[]`, `followUpsDue[]` |
| `WeeklyReviewGenerated` | Cron job fires at configured schedule (default 09:00 Monday) | WeeklyCron | Digest room (via sendMessage) | `staleProjects[]`, `overdueTasks[]`, `overdueReviews[]` |
| `EnrichmentCronRan` | Cron job fires at configured schedule (default every 6 hours) | EnrichmentCron | Logs unprocessed InboxItems older than 5 min (background retry) | `staleInboxItemIds[]` |
| `SetupWizardStarted` | Admin sends `!setup` in any room | WizardHandler | Bot (sends wizard prompts) | `userId`, `roomId` |
| `SetupWizardCompleted` | Admin completes the 3-step wizard (space name, invite users, done) | WizardHandler | Space creator, room creator, config.yaml writer | `spaceName`, `spaceId`, `digestRoomId`, `inboxRooms{}`, `users[]` |

---

## Aggregate Boundaries

### 1. Inbox Processing Aggregate

- **Aggregate root**: `InboxItem`
- **Members**: None (InboxItem is a transient capture record)
- **Invariants**:
  - An InboxItem must have `rawContent` and `createdBy`.
  - Status transitions: `new` -> `processed` -> `archived` (no skipping or reversing).
  - Once processed, the InboxItem is not modified again.
- **Concurrency Notes**: Last-write-wins. Each inbox message creates a new InboxItem; no contention expected since each user has their own inbox room.

### 2. Project Aggregate

- **Aggregate root**: `Project`
- **Members**: `Task` (via projectId), `WaitingFor` (via projectId), `ShoppingItem` (via projectId), `Note` (via projectId)
- **Invariants**:
  - A Project must have a `name` and an `owner`.
  - Only active projects should have tasks added to them via the project room handler (enforced by application logic, not DB constraint).
  - When a Project is created, a Matrix room may be created and its `matrixRoomId` updated.
  - Status transitions: `active` -> `on_hold` -> `completed` -> `archived` (any transition is allowed in practice).
- **Concurrency Notes**: Last-write-wins. Project metadata updates are infrequent. Tasks are appended independently and do not conflict with project-level changes.

### 3. Task Aggregate

- **Aggregate root**: `Task`
- **Members**: None (Task is a leaf entity)
- **Invariants**:
  - A Task must have a `title` and an `owner`.
  - `priority` must be one of `low | medium | high`.
  - `context` (if set) must be one of `home | work | errands | phone | computer | waiting`.
  - Status transitions: `pending` -> `in_progress` -> `done`.
- **Concurrency Notes**: Last-write-wins. Tasks are typically modified by their owner only.

### 4. Contact + Event Aggregate

- **Aggregate root**: `Contact`
- **Members**: `EventAttendee` (join to Event)
- **Invariants**:
  - A Contact must have a `name`.
  - An EventAttendee requires both a valid `eventId` and `contactId` (FK constraints).
- **Concurrency Notes**: Last-write-wins. Contacts are rarely updated concurrently.

### 5. Event Aggregate

- **Aggregate root**: `Event`
- **Members**: `EventAttendee` (join to Contact)
- **Invariants**:
  - An Event must have a `title` and `startAt`.
  - `endAt`, if set, should logically be after `startAt` (not enforced by DB constraint).
- **Concurrency Notes**: Last-write-wins.

### 6. Place + Shopping Aggregate

- **Aggregate root**: `Place`
- **Members**: `ShoppingItem` (via placeId), `LocationCooldown` (via placeId)
- **Invariants**:
  - A Place must have `name`, `lat`, and `lon`.
  - ShoppingItem status transitions: `pending` -> `purchased`.
  - LocationCooldown is upserted (insert or update on conflict) per user+place pair.
  - Proximity alerts are suppressed for `LOCATION_COOLDOWN_MINUTES` (default 120) after the last alert for a given user+place combination.
- **Concurrency Notes**: LocationCooldown uses upsert (ON CONFLICT DO UPDATE) for safe concurrent writes. ShoppingItem purchases are user-initiated and non-conflicting.

### 7. Note (Zettelkasten) Aggregate

- **Aggregate root**: `Note`
- **Members**: `NoteLink` (self-referential join table)
- **Invariants**:
  - A Note must have a unique `zettelId` (timestamp-based), `title`, and `content`.
  - NoteLinks require valid `fromNoteId` and `toNoteId` (FK constraints).
  - `zettelId` is generated from the current timestamp (`YYYYMMDDHHmmss`) and is unique.
- **Concurrency Notes**: Last-write-wins. Note creation is append-only in practice.

### 8. Area Aggregate

- **Aggregate root**: `Area`
- **Members**: `Project` (via areaId), `Task` (via areaId)
- **Invariants**:
  - An Area must have a `name` and an `owner`.
  - `reviewFrequency` must be one of `weekly | monthly | quarterly`.
- **Concurrency Notes**: Last-write-wins. Areas are long-lived and rarely modified.

### 9. SomedayMaybe (standalone)

- **Aggregate root**: `SomedayMaybe`
- **Members**: None
- **Invariants**:
  - Must have a `title` and an `owner`.
  - `reviewDate` defaults to 90 days from creation (set by AI enrichment).
- **Concurrency Notes**: Last-write-wins. Items are independent.

### 10. Resource (standalone)

- **Aggregate root**: `Resource`
- **Members**: None
- **Invariants**:
  - Must have a `title` and an `owner`.
  - `sourceType` must be one of `article | book | podcast | video | paper | other`.
- **Concurrency Notes**: Last-write-wins.

---

## Key Business Rules

1. **Rule**: Only the admin user (`ADMIN_MATRIX_ID`) can initiate the `!setup` wizard.
   - **Enforcement**: Application logic in `wizard.ts` -- checks `userId !== env.ADMIN_MATRIX_ID` before proceeding.
   - **Severity**: Block action. Non-admin users receive an error message.

2. **Rule**: Historical Matrix events replayed on bot restart must not be re-processed.
   - **Enforcement**: Application logic in `bot/index.ts` -- records `startupTs = Date.now()` before `client.start()` and drops any event with `origin_server_ts < startupTs`.
   - **Severity**: Block action (silently ignored). Without this, the wizard re-runs and duplicate rooms/records are created.

3. **Rule**: The bot must not invite itself when creating rooms.
   - **Enforcement**: Application logic -- the bot is the room creator and is already a member; its user ID is excluded from invite lists.
   - **Severity**: Would cause `M_FORBIDDEN` error from Matrix homeserver if violated.

4. **Rule**: Every captured record must have an `owner` (a username or `'shared'`) and a `createdBy` string.
   - **Enforcement**: Database NOT NULL constraints on `owner` and `created_by` columns. AI pipeline always populates these fields.
   - **Severity**: Block action (database insert fails).

5. **Rule**: Classification confidence must meet the threshold (`CLASSIFICATION_CONFIDENCE_THRESHOLD`, default 0.7) or clarification is requested.
   - **Enforcement**: AI pipeline Stage 1 (`ClarifySchema` check -- `needsClarification && confidence > 0.5` triggers clarification). The classify prompt also sets `needsClarification` when ambiguous.
   - **Severity**: Soft constraint -- if the clarification check fails (exception), the pipeline proceeds with classification anyway.

6. **Rule**: Proximity alerts are rate-limited per user per place by a cooldown period (`LOCATION_COOLDOWN_MINUTES`, default 120 minutes).
   - **Enforcement**: `checkCooldown()` queries `location_cooldowns` table for a recent `lastAlertedAt` within the cooldown window. `updateCooldown()` upserts the timestamp after sending an alert.
   - **Severity**: Block action (alert suppressed silently). Prevents notification spam.

7. **Rule**: Proximity alerts only fire when there are pending (unpurchased) ShoppingItems linked to the nearby Place.
   - **Enforcement**: Application logic in `proximity.ts` -- `getPendingItemsForPlace()` filters for `status = 'pending'`.
   - **Severity**: Block action (no alert sent if no pending items).

8. **Rule**: `config.yaml` must be read fresh on every incoming message (never cached as a singleton) because the setup wizard writes it at runtime.
   - **Enforcement**: Architectural convention -- `loadConfigYaml()` is called in message handlers, not the cached `config` export.
   - **Severity**: If violated, inbox routing breaks after wizard completion until bot restart.

9. **Rule**: New Projects automatically get a dedicated Matrix room added to the Space, with all configured users invited.
   - **Enforcement**: Application logic in `inbox.ts` -- when `result.newProjectRoom === true`, calls `createProjectRoom()` and updates `matrixRoomId` in the database.
   - **Severity**: Soft constraint -- if room creation fails, the error is logged but the project record is still saved.

10. **Rule**: Messages in a project room are always saved as Tasks linked to that project.
    - **Enforcement**: Application logic in `project.ts` handler -- looks up the project by `matrixRoomId`, then inserts a Task with the project's ID.
    - **Severity**: Hard constraint -- if no project is found for the room, the message is silently ignored.

11. **Rule**: Zettel IDs are generated from the current timestamp (YYYYMMDDHHmmss) and must be unique.
    - **Enforcement**: Database UNIQUE constraint on `notes.zettel_id`. Generated by `generateZettelId()` in the pipeline.
    - **Severity**: Block action (database insert fails on duplicate). In practice, collisions are extremely unlikely given second-level granularity.

12. **Rule**: The daily digest cron reports tasks due today, events today, and overdue follow-ups. The weekly review cron reports stale projects (active for 14+ days with no next action), overdue tasks, and someday/maybe items past their review date.
    - **Enforcement**: Cron jobs in `cron/daily.ts` and `cron/weekly.ts`, scheduled via `node-cron` from `config.yaml` schedules.
    - **Severity**: Informational -- failure is logged but does not block other system operations.

13. **Rule**: The enrichment cron only considers unprocessed InboxItems older than 5 minutes (to avoid racing with the real-time pipeline).
    - **Enforcement**: Application logic in `cron/enrich.ts` -- filters by `createdAt < fiveMinutesAgo`.
    - **Severity**: Soft constraint -- currently logs items for manual review rather than re-running the pipeline.

---

## Glossary of Domain Terms

- **GTD (Getting Things Done)**: A personal productivity methodology by David Allen. The system organizes work into actionable tasks, projects, waiting-for items, someday/maybe lists, and reference material.
- **Inbox**: A capture point for unprocessed thoughts and messages. In this system, each user has a dedicated Matrix room (inbox room) where they send raw text to be classified by the AI pipeline.
- **Next Action**: The single next physical, visible activity that moves a project forward. A core GTD concept stored on the Project entity.
- **Waiting For**: A GTD list item representing something delegated to or expected from another person, tracked with a follow-up date.
- **Someday/Maybe**: A GTD list for ideas and possibilities that are not currently actionable but should be reviewed periodically.
- **Area (of Responsibility)**: An ongoing standard to maintain, with no end date (unlike a Project). Examples: Health, Finance, Home maintenance.
- **Zettelkasten**: A note-taking method using atomic, interlinked notes identified by unique IDs. The system generates timestamp-based zettelIds and supports note-to-note links via the NoteLink table.
- **Matrix Space**: A Matrix protocol construct that groups related rooms under a single parent. The bot creates one Space containing the digest room, all inbox rooms, and all project rooms.
- **Digest Room**: A shared Matrix room where the bot posts daily and weekly summary messages (digests) generated by cron jobs.
- **Pipeline**: The 6-stage AI processing flow: Clarify -> Context Load -> Classify + Extract -> Enrich -> Write to DB -> Return Result.
- **Owner**: A plain text field containing a username (e.g., `alice`, `joseph`) or `shared`. Determines who is responsible for a record. The AI pipeline assigns ownership based on message content, sender, and the dynamic user list from `config.yaml`.
- **Proximity Alert**: A notification sent when a user's live location is within `ALERT_RADIUS_METERS` of a Place that has pending ShoppingItems. Rate-limited by cooldown.
- **Cooldown**: A per-user, per-place timer that suppresses repeated proximity alerts for `LOCATION_COOLDOWN_MINUTES` (default 120 minutes).
- **Clarification**: When the AI pipeline cannot confidently classify a message, it asks the user follow-up questions in a thread. The user's reply is merged with the original message and re-processed.
- **Capture Source**: The Matrix room ID where a message was originally sent. Stored on InboxItem for traceability.
- **Stale Project**: A project that has been active for more than 14 days but has no `nextAction` defined. Surfaced in the weekly review.

---

## Open Questions

- **ShoppingItem-to-Place linking**: ShoppingItems can be linked to a Place via `placeId`, but the AI pipeline's enrichment step does not currently attempt to match `whereToBuy` text to an existing Place. How should this matching work?
  - *Why it matters*: Without it, proximity alerts only work for manually linked items.
  - *Who can answer*: Product owner / AI pipeline developer.

- **Enrichment cron scope**: The enrichment cron currently only logs stale unprocessed items. Should it fully re-run the AI pipeline on these items?
  - *Why it matters*: Affects whether failed pipeline runs are automatically retried.
  - *Who can answer*: Product owner.

- **Note link creation**: The NoteLink table exists but there is no pipeline or handler code that creates note links. How should links between notes be established (e.g., by tag overlap, by explicit user syntax like `[[zettelId]]`, by AI inference)?
  - *Why it matters*: Determines whether the Zettelkasten graph is actually usable.
  - *Who can answer*: Product owner / AI pipeline developer.

- **Event attendee linking**: The EventAttendee join table exists but the event writer in the pipeline does not populate it. The classify prompt asks for `attendees` (name strings) but the writer ignores them. Should the pipeline attempt to match attendee names to existing Contacts?
  - *Why it matters*: Affects the usefulness of the event-contact relationship.
  - *Who can answer*: AI pipeline developer.

- **Record updates and deletions**: The current system is append-only -- there is no handler for updating or deleting existing records via chat commands. Is this intentional, or should users be able to say "mark task X as done" or "delete project Y"?
  - *Why it matters*: Determines whether a command parser or additional LLM intents are needed.
  - *Who can answer*: Product owner.

- **Area review tracking**: Areas have `lastReviewedAt` and `reviewFrequency` but no mechanism to mark an area as reviewed or to surface areas due for review in the digests.
  - *Why it matters*: The review cycle is defined but not actionable.
  - *Who can answer*: Product owner / cron developer.
