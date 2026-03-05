# Feature: Model Management

## User Story
As a system operator
I want the bot to automatically discover and use the latest available LLM model
So that I don't need to manually update model IDs when new versions are released.

## Background
Given the bot is running with `LLM_PROVIDER=bedrock`
And the EC2 instance has IAM permissions for `bedrock:ListFoundationModels` and `bedrock:InvokeModel`

## Scenarios

### Scenario: Model ID fallback chain
> The bot resolves which model to use via a priority chain.

Given the model resolution priority is:
  1. `config.yaml` `llm_model` field (set via `!model` command)
  2. `BEDROCK_MODEL_ID` environment variable (set in `.env`)
  3. Auto-discovered latest Sonnet from Bedrock API
  4. Zod schema default value
When the bot needs to make an LLM call
Then it checks each level in order and uses the first non-empty value

### Scenario: Config override takes highest priority
> A model set via !model always wins over env vars and auto-discovery.

Given `config.yaml` has `llm_model: anthropic.claude-haiku-4-5-20251001-v1:0`
And `BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-5-20250929-v1:0` is set in the environment
When the bot makes an LLM call
Then it uses `anthropic.claude-haiku-4-5-20251001-v1:0` from config

### Scenario: Env var is used when no config override exists
> Without a !model override, the env var is used.

Given `config.yaml` does NOT have a `llm_model` field
And `BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-5-20250929-v1:0` is set in the environment
When the bot makes an LLM call
Then it uses `us.anthropic.claude-sonnet-4-5-20250929-v1:0` from the env var

### Scenario: Auto-discovery when no model is explicitly configured
> The bot queries Bedrock and picks the latest Sonnet automatically.

Given `config.yaml` does NOT have a `llm_model` field
And `BEDROCK_MODEL_ID` is NOT set in the environment
When the bot makes its first LLM call
Then it calls `ListFoundationModels` with `byProvider: 'Anthropic'`
And filters for models with IDs starting with `anthropic.claude`
And selects the latest active model in the "sonnet" tier
And logs "Auto-selected Bedrock model: <model-id>"
And uses that model for the LLM call

### Scenario: Auto-discovered model is cached
> The bot only calls ListFoundationModels once per process lifetime.

Given the bot auto-discovered a model on its first LLM call
When the bot makes subsequent LLM calls
Then it reuses the cached model ID without calling ListFoundationModels again

### Scenario: Model list cache expires after 1 hour
> The !model list command uses a cache with a 1-hour TTL.

Given the model list was last fetched 2 hours ago
When the admin runs `!model list`
Then the bot fetches a fresh model list from Bedrock (cache expired)
And updates the cache with the new results

### Scenario: Model list is force-refreshed on !model list
> The list command always fetches fresh data.

Given the model list was cached 5 minutes ago
When the admin runs `!model list`
Then the bot fetches a fresh model list from Bedrock (force refresh)

### Scenario: Models are sorted by version within each tier
> Newer models appear after older models in the list.

Given Bedrock returns these Sonnet models:
  - `anthropic.claude-sonnet-4-20250514-v1:0`
  - `anthropic.claude-sonnet-4-5-20250929-v1:0`
  - `anthropic.claude-sonnet-4-6`
When the bot sorts and displays models
Then the sort order within the Sonnet tier is:
  1. `anthropic.claude-sonnet-4-20250514-v1:0`
  2. `anthropic.claude-sonnet-4-5-20250929-v1:0`
  3. `anthropic.claude-sonnet-4-6`
And "latest" selects `anthropic.claude-sonnet-4-6`

### Scenario: Tier detection from model ID
> The bot correctly identifies opus, sonnet, and haiku tiers from model IDs.

Given the following model IDs:
  | Model ID | Expected Tier |
  |---|---|
  | `anthropic.claude-opus-4-6-v1` | opus |
  | `anthropic.claude-sonnet-4-5-20250929-v1:0` | sonnet |
  | `anthropic.claude-haiku-4-5-20251001-v1:0` | haiku |
  | `anthropic.claude-3-haiku-20240307-v1:0` | haiku |
When the bot classifies each model
Then the tier matches the expected value

### Scenario: LEGACY and inactive models are excluded from discovery
> Only models with `modelLifecycle.status === 'ACTIVE'` are returned.

Given Bedrock returns these models:
  | Model ID | Lifecycle Status |
  |---|---|
  | `anthropic.claude-sonnet-4-5-20250929-v1:0` | ACTIVE |
  | `anthropic.claude-3-5-sonnet-20241022-v2:0` | LEGACY |
  | `anthropic.claude-3-haiku-20240307-v1:0` | LEGACY |
  | `anthropic.claude-haiku-4-5-20251001-v1:0` | ACTIVE |
When the bot lists or discovers models
Then only the 2 ACTIVE models are included
And the LEGACY models are not shown in `!model list`
And the LEGACY models are never auto-selected by `!model latest`

### Scenario: Auto-discovery falls back across tiers
> If no Sonnet is available, the bot tries other tiers.

Given Bedrock only has active Haiku models (no Sonnet, no Opus)
When the bot auto-discovers the latest model
Then it selects the latest active Haiku model
And logs the selection

### Scenario: Auto-discovery returns null when no models are available
> If no active Anthropic models exist, auto-discovery returns null and the Zod default is used.

Given Bedrock returns no active Anthropic models
When the bot auto-discovers the latest model
Then auto-discovery returns null
And the bot falls back to the Zod schema default: `us.anthropic.claude-sonnet-4-5-20250929-v1:0`

### Scenario: Auto-discovery failure does not crash the bot
> If the ListFoundationModels call fails, the bot logs a warning and falls back.

Given the Bedrock `ListFoundationModels` call throws an error (e.g., network timeout)
When the bot tries to auto-discover models
Then it logs "Failed to discover Bedrock models: <error>"
And returns null (triggering the Zod default fallback)
And the bot continues to function normally

### Scenario: Model change takes effect on next message
> Changing the model via !model does not affect in-flight LLM calls.

Given the bot is processing a message with the current model
When the admin sends `!model <new-model-id>` concurrently
Then the in-flight message completes with the old model
And the next message uses the new model (config.yaml is read fresh per call)

### Scenario: Anthropic provider also supports runtime model switching
> The !model command works with LLM_PROVIDER=anthropic too.

Given `LLM_PROVIDER=anthropic`
When the admin sends `!model claude-sonnet-4-6`
Then the bot saves the model to config.yaml
And the Anthropic provider reads `config.yaml` on each call
And uses `claude-sonnet-4-6` instead of the `ANTHROPIC_MODEL_ID` env default
