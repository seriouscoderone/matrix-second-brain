# Matrix Second Brain -- Archetype

## App Identity
- **Name**: Matrix Second Brain
- **Slug**: matrix-second-brain
- **Description**: A Matrix chat bot that turns a Matrix Space into a GTD (Getting Things Done) second brain for a household, automatically classifying free-text messages into structured records via an LLM pipeline.
- **Primary Purpose**: Eliminates the friction of organizing captured thoughts by letting users type naturally in a chat room and having an AI classify, enrich, persist, and resurface information at the right time and place.

## Selected Archetype(s)

This is a backend service, not a web application. The standard UI-centric archetypes (CRUD Manager, Dashboard, etc.) do not directly apply. The closest analogues, adapted for a chat-bot service:

- **Primary**: Workflow Engine -- The core of the system is the 6-stage AI pipeline that processes unstructured messages through clarification, classification, enrichment, and persistence stages. Messages flow through a state machine (new -> clarification-needed -> classified -> enriched -> persisted). The inbox-to-record workflow is the defining behavior.
- **Secondary**: Communication Hub -- The bot operates entirely within the Matrix messaging protocol. It receives events, sends threaded replies, manages rooms and spaces, and delivers digest messages. The Matrix protocol is both the input and output channel.

## Archetype Defaults Applied

### Interaction Patterns (adapted from Page Patterns)

Since there is no UI, these are the equivalent "interaction surfaces":

| Pattern | Description | Status |
|---|---|---|
| Inbox capture | User sends free-text message in their personal inbox room | Confirmed |
| Thread reply (confirmation) | Bot replies in-thread with classification result | Confirmed |
| Thread reply (clarification) | Bot asks follow-up questions in-thread when message is ambiguous | Confirmed |
| Project room capture | User sends message in a project room; bot saves it as a task | Confirmed |
| Proximity alert | Bot sends a plain message when user is near a store with pending items | Confirmed |
| Daily digest | Bot posts a summary of tasks, events, and follow-ups to the digest room | Confirmed |
| Weekly review | Bot posts stale projects, overdue tasks, and review items to the digest room | Confirmed |
| Setup wizard | Admin runs `!setup` and answers prompts to bootstrap the Space | Confirmed |

### Component Patterns (adapted for service layer)

| Component | Description |
|---|---|
| AI Pipeline | 6-stage processor: clarify -> context load -> classify+extract -> enrich -> write -> result |
| LLM Provider | Pluggable interface (Bedrock, Anthropic, Mock) for AI inference |
| Matrix Client | matrix-bot-sdk with auto-join, sync loop, message sending |
| Room Manager | Creates and organizes Space, inbox rooms, project rooms, digest room |
| Cron Scheduler | node-cron jobs for daily digest, weekly review, enrichment sweep |
| Proximity Engine | Haversine distance calculator with cooldown-based alert suppression |
| Config Loader | Two-layer config: .env (Zod-validated secrets) + config.yaml (runtime preferences) |
| DB Layer | Drizzle ORM over PostgreSQL with typed query helpers per entity |

### State Complexity
Medium-high. The pipeline manages in-flight clarification state (in-memory Map per user), wizard state (in-memory Map per user), and cooldown state (database). Most persistent state lives in PostgreSQL. No distributed state or optimistic concurrency control.

### API Style
Event-driven (Matrix protocol). No HTTP API. Internal service contracts are TypeScript interfaces (`LLMProvider`, `MatrixClientLike`, `PipelineResult`). LLM outputs validated by Zod schemas.

## Target User Roles

| Role | Access Level | Primary? | Notes |
|---|---|---|---|
| Admin | Global | No | Runs `!setup` once. Otherwise acts as a HouseholdMember. |
| HouseholdMember | Owner-scoped + Shared | Yes | The primary daily user. Captures messages, receives digests and alerts. |
| Bot (System) | Global (system) | N/A | Automated actor. Processes all events, writes all records, manages all rooms. |

## App-Specific Goals
1. Every message sent to an inbox room is classified and persisted within seconds, with a confirmation reply in-thread.
2. Users receive actionable daily and weekly summaries without needing to query or search.
3. Proximity-based shopping reminders fire reliably when a user is near a relevant store, without alert fatigue (cooldown enforcement).

## Overrides & Customizations
- No page patterns, navigation, or UI components -- all interaction is through Matrix chat messages.
- No client-side state management -- all state is server-side (PostgreSQL + in-memory Maps).
- No REST/GraphQL API -- the Matrix Client-Server sync loop is the sole event transport.

## Relationship to Other Apps
This is the only app in the suite. No cross-app relationships exist.
