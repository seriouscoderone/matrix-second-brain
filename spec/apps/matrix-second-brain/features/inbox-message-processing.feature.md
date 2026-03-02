# Feature: Inbox Message Processing

## User Story
As a HouseholdMember
I want to send any free-text message to my inbox room
So that the bot automatically classifies it, enriches it, saves it as a structured record, and confirms what it created.

## Background
Given the bot is running and the setup wizard has completed
And `config.yaml` has my inbox room configured
And the database contains the schema tables
And the LLM provider is configured and available

## Scenarios

### Scenario: Message classified as a task
> A straightforward task message is classified and saved.

Given I am in my inbox room
When I send "Buy new running shoes by Friday"
Then the bot inserts an InboxItem with `status = new` and my username as `createdBy`
And the AI pipeline classifies the message as category `task`
And the bot inserts a Task with title "Buy new running shoes", dueDate set to this Friday, and priority inferred by the LLM
And the bot replies in-thread: "Saved as **task**: Buy new running shoes"

### Scenario: Message classified as a project
> A multi-step outcome triggers project creation and a Matrix room.

Given I am in my inbox room
When I send "Remodel the kitchen - need to find a contractor, get quotes, and choose materials"
Then the AI pipeline classifies the message as category `project`
And the bot inserts a Project with name "Remodel the kitchen" and fields extracted from the message
And the bot creates a new Matrix room named `#project-remodel-the-kitchen`
And the bot adds the project room to the Space
And the bot updates the Project record with the new `matrixRoomId`
And the bot replies in-thread: "Saved as **project**: Remodel the kitchen"

### Scenario: Message classified as a shopping item
> A purchase item is saved with AI-enriched fields.

Given I am in my inbox room
When I send "Need more coffee beans from Trader Joe's"
Then the AI pipeline classifies the message as category `shopping`
And the bot inserts a ShoppingItem with item "coffee beans", whereToBuy "Trader Joe's"
And the bot replies in-thread confirming the shopping item

### Scenario: Message classified as an event
> A calendar event is extracted with time and location.

Given I am in my inbox room
When I send "Dinner with the Smiths next Saturday at 7pm at Luigi's"
Then the AI pipeline classifies the message as category `event`
And the bot inserts an Event with title, startAt parsed to next Saturday 19:00, and location "Luigi's"
And the bot replies in-thread confirming the event

### Scenario: Message classified as a contact
> Contact information is extracted and saved.

Given I am in my inbox room
When I send "Met Sarah from Acme Corp, her email is sarah@acme.com"
Then the AI pipeline classifies the message as category `contact`
And the bot inserts a Contact with name "Sarah", company "Acme Corp", email "sarah@acme.com"
And the bot replies in-thread confirming the contact

### Scenario: Message classified as a note
> A thought or idea is saved as a Zettelkasten note.

Given I am in my inbox room
When I send "Insight: compound interest applies to habits too, not just money"
Then the AI pipeline classifies the message as category `note`
And the bot inserts a Note with a generated zettelId, title extracted from the message, and content
And the bot replies in-thread confirming the note

### Scenario: Message classified as a resource
> A reference to external content is captured.

Given I am in my inbox room
When I send "Great article on time management: https://example.com/time-tips by John Doe"
Then the AI pipeline classifies the message as category `resource`
And the bot inserts a Resource with title, url, sourceType "article", author "John Doe"
And the bot replies in-thread confirming the resource

### Scenario: Message classified as waiting_for
> A delegated item is tracked with a follow-up date.

Given I am in my inbox room
When I send "Waiting for Bob to send the plumber's quote"
Then the AI pipeline classifies the message as category `waiting_for`
And the bot inserts a WaitingFor with title and followUpDate defaulting to 7 days from now
And the bot replies in-thread confirming the waiting-for item

### Scenario: Message classified as someday_maybe
> A future possibility is captured for later review.

Given I am in my inbox room
When I send "Someday I'd love to learn woodworking"
Then the AI pipeline classifies the message as category `someday_maybe`
And the bot inserts a SomedayMaybe with title and reviewDate defaulting to 90 days from now
And the bot replies in-thread confirming the someday/maybe item

### Scenario: Message classified as an area
> An area of responsibility is established.

Given I am in my inbox room
When I send "I want to track our family health area - regular checkups, exercise, nutrition"
Then the AI pipeline classifies the message as category `area`
And the bot inserts an Area with name "Family Health" and extracted details
And the bot replies in-thread confirming the area

### Scenario: Pipeline error during classification
> The LLM returns invalid JSON or an unexpected error occurs.

Given I am in my inbox room
And the LLM provider is returning malformed responses
When I send "Fix the garden fence"
Then the bot inserts an InboxItem with `status = new`
And the pipeline throws an error during classification
And the bot replies in-thread with an error message: "Error processing message: ..."
And the InboxItem remains in `new` status for the enrichment cron to retry

### Scenario: Owner assignment based on sender
> The AI assigns ownership based on who sent the message and content.

Given I am "alice" in my inbox room
When I send "I need to schedule my annual physical"
Then the AI pipeline assigns `owner = alice` because the message uses "I" and was sent by alice
And the Task is created with `owner = alice`

### Scenario: Owner defaults to shared for ambiguous messages
> When ownership is unclear, the default is "shared".

Given I am "alice" in my inbox room
When I send "We need more paper towels"
Then the AI pipeline assigns `owner = shared` because the message uses "we"
And the ShoppingItem is created with `owner = shared`

### Scenario: Message from non-inbox room is ignored
> Messages in rooms not listed as inbox rooms are not processed by the inbox handler.

Given I am in a room that is not configured as any user's inbox
And the room is not a project room
When I send "Buy milk"
Then the bot does not invoke the AI pipeline
And no InboxItem or domain record is created

### Scenario: Bot's own messages are ignored
> The bot does not process its own messages.

Given the bot sends a confirmation reply in an inbox room
Then the bot does not process its own message through the pipeline
And no InboxItem is created for the bot's reply

### Scenario: Historical replay events are dropped
> Events from before the bot's startup timestamp are silently ignored.

Given the bot just started and `startupTs` is recorded
When the Matrix sync delivers events with `origin_server_ts` before `startupTs`
Then the bot drops those events without processing
And no InboxItems or records are created from replayed events

### Scenario: Context loading provides existing data to the classifier
> The AI pipeline loads existing projects, contacts, areas, and tasks to give the LLM context.

Given the database contains active projects "Kitchen Remodel" and "Tax Prep"
And the database contains contacts "Sarah" and "Bob"
When I send "Call Sarah about the kitchen countertops"
Then the context loader provides the existing projects and contacts to the LLM
And the LLM can match "Sarah" to the existing contact and "kitchen" to the existing project
