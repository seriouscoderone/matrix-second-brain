# Feature: Weekly Review

## User Story
As a HouseholdMember
I want to receive a weekly review highlighting stale projects, overdue tasks, and someday/maybe items past their review date
So that I can keep my GTD system current and nothing falls through the cracks.

## Background
Given the bot is running and the setup wizard has completed
And a digest room exists and is configured in `config.yaml`
And the weekly review cron is scheduled (default: `0 9 * * 1` -- Monday 9 AM)

## Scenarios

### Scenario: Weekly review with stale projects, overdue tasks, and reviews
> A complete weekly review is sent with all three categories.

Given the database contains:
  - Project "Website Redesign" with status "active", createdAt 21 days ago, nextAction = null
  - Project "Tax Prep" with status "active", createdAt 7 days ago, nextAction = "Gather W-2s" (not stale)
  - Task "Call dentist" with dueDate 3 days ago, status "pending", owner "alice"
  - SomedayMaybe "Learn Spanish" with reviewDate 5 days ago
When the weekly review cron fires
Then the bot sends a message to the digest room containing:
  - Header: "Weekly Review"
  - Section: "Stale projects (no next action):" listing "Website Redesign"
  - Section: "Overdue tasks:" listing "Call dentist" with due date and owner
  - Section: "Someday/Maybe past review date:" listing "Learn Spanish"

### Scenario: Weekly review with no issues
> A positive message is sent when everything is in order.

Given no projects are stale (all active projects have nextAction or are less than 14 days old)
And no tasks are overdue
And no SomedayMaybe items are past their reviewDate
When the weekly review cron fires
Then the bot sends: "Everything looks good! Great week."

### Scenario: Stale project detection logic
> A project is stale if it has been active for 14+ days and has no nextAction defined.

Given Project "Old Project" with status "active", createdAt 30 days ago, nextAction = null
And Project "Maintained Project" with status "active", createdAt 30 days ago, nextAction = "Do next step"
And Project "New Project" with status "active", createdAt 5 days ago, nextAction = null
When the weekly review cron fires
Then only "Old Project" is listed as stale
And "Maintained Project" is not listed (has nextAction)
And "New Project" is not listed (less than 14 days old)

### Scenario: Non-active projects are not included
> Only projects with status "active" are checked for staleness.

Given Project "Archived Project" with status "archived", createdAt 60 days ago, nextAction = null
And Project "Completed Project" with status "completed", createdAt 45 days ago, nextAction = null
When the weekly review cron fires
Then neither archived nor completed projects appear in the stale list

### Scenario: Overdue tasks show due date and owner
> Each overdue task displays its due date and owner for accountability.

Given Task "Overdue Item" with dueDate = 5 days ago, owner "bob"
When the weekly review cron fires
Then the overdue task line includes the due date and "(bob)"

### Scenario: Weekly review cron error is caught
> Database errors are logged without crashing the bot.

Given the database is temporarily unavailable
When the weekly review cron fires
Then an error is logged: "Weekly review error: ..."
And the bot continues running

### Scenario: Digest room not configured prevents cron scheduling
> If no digest room is configured, the weekly review is not scheduled.

Given `config.yaml` has an empty `rooms.digest` value
When the bot starts up
Then the weekly review cron is not scheduled
