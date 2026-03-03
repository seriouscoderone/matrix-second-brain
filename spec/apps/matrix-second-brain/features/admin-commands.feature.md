# Feature: Admin Commands

## User Story
As an Admin or HouseholdMember
I want bot commands for help, status, and model management
So that I can understand what the bot does, check its health, and control which LLM model it uses.

## Background
Given the bot is running and the setup wizard has completed
And the bot is connected to the Matrix homeserver

## Scenarios

### Scenario: Any user can run !help
> The help command shows available commands and capture categories.

Given I am any user in a room with the bot
When I send `!help`
Then the bot replies with:
  - A list of capture categories (task, project, event, contact, resource, note, shopping, waiting_for, someday_maybe, area)
  - An explanation of location alerts
  - A table of commands available to all users (`!help`, `!status`)

### Scenario: Admin sees extra commands in !help
> The admin gets additional information in the help output.

Given I am logged in as the admin user (`ADMIN_MATRIX_ID`)
When I send `!help`
Then the bot reply includes all standard help content
And additionally shows admin-only commands: `!setup`, `!setup force`, `!model`, `!model list`, `!model latest`, `!model reset`
And shows current configuration: LLM provider, model, users, alert radius, confidence threshold

### Scenario: Non-admin does not see admin commands in !help
> Regular users see a limited help message.

Given I am logged in as a non-admin user
When I send `!help`
Then the bot reply does NOT include `!setup`, `!model`, or configuration details

### Scenario: Any user can run !status
> The status command shows bot health and configuration summary.

Given I am any user in a room with the bot
When I send `!status`
Then the bot replies with:
  - Uptime in hours and minutes
  - Current LLM provider and model
  - Number of configured users
  - Space name (or "(not configured)" if setup has not been run)

### Scenario: !status shows correct uptime
> Uptime is calculated from the bot's startup timestamp.

Given the bot started 90 minutes ago
When I send `!status`
Then the uptime shows "1h 30m"

### Scenario: Admin views current model with !model
> The !model command with no arguments shows the active model and its source.

Given I am logged in as the admin user
When I send `!model`
Then the bot replies with the current model ID
And indicates whether the model came from "config" (runtime override) or "env default"
And shows available subcommands: `!model list`, `!model latest`, `!model <id>`

### Scenario: Non-admin cannot use !model
> Model management is restricted to the admin.

Given I am logged in as a non-admin user
When I send `!model`
Then the bot replies "Only the admin can change the model."

### Scenario: Admin switches to a specific model
> The admin can set an explicit model ID.

Given I am logged in as the admin user
When I send `!model anthropic.claude-haiku-4-5-20251001-v1:0`
Then the bot saves the model ID to `config.yaml` under `llm_model`
And the bot replies "Model switched to `anthropic.claude-haiku-4-5-20251001-v1:0`. Takes effect on next message."
And the next LLM call uses the new model ID

### Scenario: Admin resets model to env default
> The !model reset command clears the config override.

Given I am logged in as the admin user
And a model override exists in config.yaml
When I send `!model reset`
Then the bot removes the `llm_model` key from config.yaml
And the bot replies with the env default model ID it will revert to
And the next LLM call uses the env default (or auto-discovered model)

### Scenario: Admin lists available Bedrock models
> The !model list command queries the Bedrock API and shows available models.

Given I am logged in as the admin user
And `LLM_PROVIDER=bedrock`
When I send `!model list`
Then the bot queries the Bedrock `ListFoundationModels` API filtered by provider "Anthropic"
And the bot replies with models grouped by tier: Opus, Sonnet, Haiku
And each model shows its model ID and active/inactive status
And the current model is marked with "<< current"

### Scenario: !model list is not available for non-Bedrock providers
> Model discovery only works with the Bedrock provider.

Given I am logged in as the admin user
And `LLM_PROVIDER=anthropic` (or `mock`)
When I send `!model list`
Then the bot replies "Model discovery is only available with `LLM_PROVIDER=bedrock`."

### Scenario: Admin auto-selects latest Sonnet
> The !model latest command picks the newest Sonnet model.

Given I am logged in as the admin user
And `LLM_PROVIDER=bedrock`
When I send `!model latest`
Then the bot queries Bedrock for active Anthropic models
And selects the latest model in the "sonnet" tier (by version/date sort)
And saves it to config.yaml
And the bot replies with the selected model ID

### Scenario: Admin auto-selects latest model by tier
> The admin can specify a tier preference: opus, sonnet, or haiku.

Given I am logged in as the admin user
And `LLM_PROVIDER=bedrock`
When I send `!model latest haiku`
Then the bot selects the latest active Haiku model
And saves it to config.yaml
And the bot replies "Switched to latest haiku: `<model-id>`"

### Scenario: Invalid tier in !model latest
> The bot rejects unrecognized tier names.

Given I am logged in as the admin user
When I send `!model latest turbo`
Then the bot replies "Invalid tier `turbo`. Choose: `opus`, `sonnet`, or `haiku`."

### Scenario: Model discovery fails gracefully
> If the Bedrock API call fails, the bot reports the error.

Given I am logged in as the admin user
And the Bedrock `ListFoundationModels` call fails (e.g., insufficient IAM permissions)
When I send `!model list`
Then the bot replies "Failed to list models: <error message>"
And the current model continues to work unchanged
