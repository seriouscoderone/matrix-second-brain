# Feature: Daily Digest

## User Story
As a HouseholdMember
I want to receive a daily summary of tasks due today, events today, and overdue follow-ups
So that I start each day knowing what needs attention.

## Background
Given the bot is running and the setup wizard has completed
And a digest room exists and is configured in `config.yaml`
And the daily digest cron is scheduled (default: `0 8 * * *`)

## Scenarios

### Scenario: Daily digest with tasks, events, and follow-ups
> A complete digest is sent when there are items in all three categories.

Given the database contains:
  - Task "Fix leaky faucet" with priority "high", owner "alice", dueDate = today
  - Task "Submit tax forms" with priority "medium", owner "bob", dueDate = today
  - Event "Dentist" with startAt = today 14:00, location "Main St Dental"
  - WaitingFor "Plumber quote" with followUpDate <= today, owner "bob"
When the daily digest cron fires
Then the bot sends a message to the digest room containing:
  - Header: "Daily Digest"
  - Section: "Tasks due today:" with both tasks listed with priority and owner
  - Section: "Events today:" with the dentist event showing time and location
  - Section: "Follow-ups due:" with the plumber quote listed

### Scenario: Daily digest with no items
> A friendly message is sent when nothing is due.

Given no tasks have dueDate = today
And no events have startAt = today
And no WaitingFor items have followUpDate <= today
When the daily digest cron fires
Then the bot sends a message to the digest room: "Nothing due today. Enjoy your day!"

### Scenario: Daily digest with only tasks
> Sections with no items are omitted.

Given only tasks are due today (no events, no follow-ups)
When the daily digest cron fires
Then the digest message includes the "Tasks due today:" section
And the "Events today:" and "Follow-ups due:" sections are omitted

### Scenario: Event time formatting
> Events show their start time in a human-readable format.

Given an Event "Team Call" with startAt = today 09:30 AM
When the daily digest cron fires
Then the event line shows: "09:30 AM -- Team Call"

### Scenario: Event with location
> Events with a location include it in the digest.

Given an Event "Lunch" with startAt = today 12:00, location "Cafe Roma"
When the daily digest cron fires
Then the event line shows: "12:00 PM -- Lunch @ Cafe Roma"

### Scenario: Event without location
> Events without a location show only title and time.

Given an Event "Phone call" with startAt = today 15:00, location = null
When the daily digest cron fires
Then the event line shows: "03:00 PM -- Phone call" (no "@ ..." suffix)

### Scenario: Digest cron error is caught and logged
> If the database query fails, the error is logged but the bot does not crash.

Given the database is temporarily unavailable
When the daily digest cron fires
Then an error is logged: "Daily digest error: ..."
And the bot continues running
And no message is sent to the digest room

### Scenario: Digest room is not configured
> If no digest room is set in config, cron jobs are not started.

Given `config.yaml` has an empty `rooms.digest` value
When the bot starts up
Then the daily digest cron is not scheduled
And no errors are thrown
