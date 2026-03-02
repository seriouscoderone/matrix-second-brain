# Feature: Project Room Messaging

## User Story
As a HouseholdMember
I want to send messages in a project room and have them automatically saved as tasks for that project
So that I can quickly capture action items without leaving the project context.

## Background
Given the bot is running and the setup wizard has completed
And a project "Kitchen Remodel" exists in the database with a linked `matrixRoomId`
And I am a member of the project room

## Scenarios

### Scenario: Message in project room is saved as a task
> Any text message in a project room becomes a task linked to that project.

Given the project "Kitchen Remodel" has matrixRoomId matching this room
When I send "Get quotes from three different contractors"
Then the bot looks up the project by the room ID
And the bot inserts a Task with:
  - title: "Get quotes from three different contractors"
  - projectId: the Kitchen Remodel project ID
  - status: "pending"
  - priority: "medium"
  - owner: inherited from the project's owner (or sender's username if project is shared)
  - createdBy: my username
  - matrixMessageId: the event ID
And the bot replies in-thread: "Saved task for project **Kitchen Remodel**: Get quotes from three different contractors"

### Scenario: Long message is truncated for title
> Messages longer than 200 characters use the first 200 chars as the title and full text as description.

Given I am in a project room
When I send a message that is 250 characters long
Then the Task title is the first 200 characters of the message
And the Task description is the full message text

### Scenario: Short message uses full text as title only
> Messages 200 characters or shorter have no separate description.

Given I am in a project room
When I send a message that is 100 characters long
Then the Task title is the full message text
And the Task description is undefined

### Scenario: Owner assignment for shared project
> When the project owner is "shared", the task owner is derived from the sender.

Given the project "Kitchen Remodel" has owner "shared"
When alice sends a message in the project room
Then the Task is created with owner "alice"

When bob sends a message in the project room
Then the Task is created with owner "bob"

### Scenario: Owner assignment for personal project
> When the project owner is a specific person, the task inherits that owner.

Given the project "Alice's Thesis" has owner "alice"
When bob sends a message in the project room
Then the Task is created with owner "bob" (derived from the sender's username mapping)

### Scenario: No project found for room
> If the room ID does not match any project, the message is silently ignored.

Given a room exists that is not linked to any project's `matrixRoomId`
And the room is not configured as an inbox room
When I send "This should be ignored"
Then the bot does not create any Task
And the bot does not reply

### Scenario: Bot's own messages in project room are ignored
> The bot does not process its own confirmation replies.

Given the bot sends a thread reply in a project room
Then the bot does not create a Task for its own message

### Scenario: Non-text messages in project room are ignored
> Only m.text messages are processed as tasks.

Given I am in a project room
When I send an image or file (msgtype = "m.image")
Then the bot does not create a Task
And no reply is sent

### Scenario: No AI pipeline for project room messages
> Project room messages bypass the AI classification pipeline entirely.

Given I am in a project room
When I send "Call the electrician"
Then the AI pipeline is NOT invoked
And the message is saved directly as a Task with the text as the title
And no LLM calls are made
