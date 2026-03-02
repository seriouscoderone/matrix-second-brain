# Build Order: Matrix Second Brain

## Overview
- **App**: matrix-second-brain
- **Total Modules**: 12 (service-layer modules, not UI pages)
- **Target Runtime**: Node.js 20 + TypeScript
- **Key Dependencies**: matrix-bot-sdk, Drizzle ORM, node-cron, Zod, js-yaml
- **LLM Providers**: AWS Bedrock (default), Anthropic API, Mock (dev)
- **Database**: PostgreSQL via Drizzle ORM
- **Validation Score**: 95/100

## Context

This is a **backend service** with no frontend. The build order describes service-layer modules rather than UI pages. Modules are ordered by dependency -- foundational layers first, then handlers and orchestration.

## Dependency Graph

```
[Config + Env]
     |
     v
[Database Schema + Migrations]
     |
     v
[Database Queries] ──────────────────────────────────┐
     |                                                 |
     v                                                 |
[LLM Providers] ──> [AI Prompts] ──> [AI Pipeline]    |
     |                                   |             |
     v                                   v             |
[Matrix Client] ──> [Room/Space Mgmt]   |             |
     |                   |               |             |
     v                   v               v             v
[Location Engine (proximity + cooldown)]               |
     |                                                 |
     v                                                 |
[Bot Handlers: inbox, project, location, wizard]       |
     |                                                 |
     v                                                 v
[Bot Entry Point (index.ts)]  <── [Cron Jobs: daily, weekly, enrich]
```

## Build Sequence

### Tier A: Foundation (4 items)

These modules have no internal dependencies and form the base layer.

| # | Module | File(s) | Dependencies | Complexity |
|---|---|---|---|---|
| 1 | Configuration & Environment | `src/config.ts` | dotenv, zod, js-yaml, fs | Low |
| 2 | Database Schema | `src/db/schema.ts` | drizzle-orm/pg-core | Medium |
| 3 | Database Migrations | `src/db/migrate.ts`, `src/db/migrations/0001_initial.sql` | drizzle-orm, node-postgres | Low |
| 4 | LLM Provider Interface | `src/ai/providers/interface.ts` | None | Low |

### Tier B: Data Access Layer (2 items)

Database query functions and LLM provider implementations.

| # | Module | File(s) | Dependencies | Complexity |
|---|---|---|---|---|
| 5 | Database Queries | `src/db/queries/*.ts` (12 files) | Schema (Tier A) | Medium |
| 6 | LLM Providers | `src/ai/providers/bedrock.ts`, `anthropic.ts`, `mock.ts` | Interface (Tier A), Config (Tier A) | Medium |

### Tier C: Service Layer (4 items)

Core business logic modules.

| # | Module | File(s) | Dependencies | Complexity |
|---|---|---|---|---|
| 7 | AI Prompts | `src/ai/prompts/classify.ts`, `clarify.ts`, `enrich.ts` | Zod (external) | Medium |
| 8 | AI Context Loader | `src/ai/context.ts` | Schema, DB Queries (Tier B) | Low |
| 9 | AI Pipeline | `src/ai/pipeline.ts` | Providers, Prompts, Context, DB Queries | High |
| 10 | Matrix Client & Room Management | `src/bot/matrixClient.ts`, `src/matrix/rooms.ts`, `src/matrix/space.ts` | Config (Tier A), matrix-bot-sdk | Medium |

### Tier D: Handlers & Orchestration (2 items)

Top-level event handlers, cron jobs, and the main entry point.

| # | Module | File(s) | Dependencies | Complexity |
|---|---|---|---|---|
| 11 | Location Engine | `src/location/proximity.ts`, `src/location/cooldown.ts` | Config, DB Queries, Schema | Medium |
| 12 | Bot Handlers + Cron + Entry | `src/bot/handlers/*.ts`, `src/bot/setup/wizard.ts`, `src/cron/*.ts`, `src/bot/index.ts` | All above | High |

## Critical Path

The longest dependency chain determines the minimum sequential build order:

```
Config -> Schema -> Migrations -> DB Queries -> AI Context -> AI Pipeline -> Bot Handlers -> Entry Point
```

8 sequential steps. The AI Prompts and LLM Providers can be built in parallel with the DB Queries.

## Parallel Build Opportunities

| Group | Modules | Can Build Concurrently |
|---|---|---|
| Tier A | Config, Schema, Migrations, LLM Interface | All 4 are independent |
| Tier B | DB Queries, LLM Providers | Both can build in parallel |
| Tier C | AI Prompts + AI Context (parallel), then AI Pipeline (sequential after both) | Prompts and Context are independent; Pipeline depends on both |
| Tier C | Matrix Client & Room Mgmt | Independent of AI modules; can build in parallel with AI |
| Tier D | Location Engine, Bot Handlers/Cron | Location Engine is independent of handlers; can build in parallel |

## Generation Notes

### TypeScript Conventions
- Strict mode enabled (`tsconfig.json`)
- Use `Db` type from `src/db/migrate.ts` (not `NodePgDatabase<typeof schema>`) to avoid ts-jest type inference issues
- Enum values are defined as PostgreSQL enums via Drizzle `pgEnum`
- All DB queries return typed results via Drizzle schema inference

### Testing
- Unit tests use ts-jest with the project's `tsconfig.json`
- Mock provider (`LLM_PROVIDER=mock`) enables offline testing without API keys
- Integration tests require docker-compose.dev.yml running (Synapse + PostgreSQL)

### Matrix SDK
- Use `matrix-bot-sdk` (not the official matrix-js-sdk)
- `AutojoinRoomsMixin` for automatic room joining
- `SimpleFsStorageProvider` for sync token persistence
- Thread replies use `m.relates_to` with `rel_type: 'm.thread'`

### Docker
- Base image: `node:20-slim` (not Alpine -- `@matrix-org/matrix-sdk-crypto-nodejs` needs glibc)
- Drizzle migrations read from `src/db/migrations/` (not `dist/`) because tsc doesn't copy .sql files

### Configuration
- Never cache `loadConfigYaml()` for runtime reads -- call it fresh each time
- The `config` export is safe only for startup-time reads (cron schedules)
- `.env` is validated by Zod at startup; process exits on invalid values
