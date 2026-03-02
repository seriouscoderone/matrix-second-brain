# Feature: Enrichment Cron

## User Story
As a system operator
I want a background cron job to identify unprocessed inbox items older than 5 minutes
So that messages that failed the real-time pipeline can be flagged for retry or manual review.

## Background
Given the bot is running and the setup wizard has completed
And the enrichment cron is scheduled (default: `0 */6 * * *` -- every 6 hours)

## Scenarios

### Scenario: Unprocessed items older than 5 minutes are detected
> The cron identifies InboxItems stuck in `new` status.

Given the database contains:
  - InboxItem A with status "new", createdAt 10 minutes ago
  - InboxItem B with status "new", createdAt 2 minutes ago
  - InboxItem C with status "processed", createdAt 30 minutes ago
When the enrichment cron fires
Then the cron filters for items with status "new" and createdAt older than 5 minutes
And InboxItem A is identified as stale (10 min > 5 min threshold)
And InboxItem B is not identified (2 min < 5 min threshold)
And InboxItem C is not identified (status is "processed")
And the cron logs: "Found 1 unprocessed items older than 5 min"

### Scenario: No stale items found
> When all items are either processed or recent, nothing is logged.

Given all InboxItems have status "processed" or were created less than 5 minutes ago
When the enrichment cron fires
Then the cron does not log any stale item messages

### Scenario: Stale items are logged with content preview
> Each stale item is logged with its ID and a truncated content preview.

Given InboxItem with id "abc-123" and rawContent "This is a test message that is quite long and should be truncated"
And the item is older than 5 minutes with status "new"
When the enrichment cron fires
Then the cron logs: "  - [abc-123] This is a test message that is quite long and sho..."

### Scenario: Enrichment cron error is caught
> Database errors are logged without crashing the bot.

Given the database is temporarily unavailable
When the enrichment cron fires
Then an error is logged: "Enrichment cron error: ..."
And the bot continues running

### Scenario: Enrichment cron runs independently of digest room
> The enrichment cron is always scheduled, even without a digest room.

Given `config.yaml` has an empty `rooms.digest` value
When the bot starts up
Then the enrichment cron is still scheduled
And it runs on its configured schedule
