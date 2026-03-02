# Feature: Message Routing

## User Story
As the Bot system
I want to route incoming Matrix events to the correct handler based on room, message type, and user state
So that each message is processed by the appropriate subsystem without duplication or missed handling.

## Background
Given the bot is running and connected to the Matrix homeserver
And the database migrations have completed
And `config.yaml` exists with configured rooms

## Scenarios

### Scenario: Text message in inbox room routes to inbox handler
> Messages in configured inbox rooms are handled by the inbox pipeline.

Given `config.yaml` has inbox room "!inbox-alice:localhost" for user "alice"
When alice sends a text message in "!inbox-alice:localhost"
Then the message is routed to `handleInboxMessage`
And the AI pipeline is invoked

### Scenario: Text message in project room routes to project handler
> Messages in rooms matching a project's matrixRoomId are handled by the project handler.

Given a Project exists with matrixRoomId "!project-kitchen:localhost"
And "!project-kitchen:localhost" is not in `config.yaml` inbox rooms
When alice sends a text message in "!project-kitchen:localhost"
Then the message is routed to `handleProjectMessage`
And the AI pipeline is NOT invoked

### Scenario: Location event routes to location handler
> m.location events are handled by the proximity system regardless of room.

Given alice sends a location event (msgtype = "m.location") with a valid geo_uri
When the bot receives the event in any room
Then the message is routed to `handleLocationEvent`
And the proximity engine runs

### Scenario: !setup command routes to wizard handler
> The `!setup` command has highest routing priority for text messages.

Given alice (the admin) sends "!setup" in any room
Then the message is routed to `handleSetupCommand`
And no other handler processes the message

### Scenario: Wizard reply routes to wizard handler
> A user in the wizard flow has their messages captured by the wizard.

Given alice is in the setup wizard (isInSetup returns true)
When alice sends any text message in any room
Then the message is routed to `handleWizardReply`
And the inbox handler does not process it
And the project handler does not process it

### Scenario: Message in unconfigured room is silently dropped
> Messages in rooms that do not match any handler criteria are ignored.

Given a text message is sent in room "!random:localhost"
And "!random:localhost" is not an inbox room, not a project room
And the sender is not in the setup wizard
And the text is not "!setup"
When the bot receives the event
Then no handler processes the message
And no database records are created
And no replies are sent

### Scenario: Non-text messages are ignored (except location)
> Only m.text and m.location message types are processed.

Given alice sends an image (msgtype = "m.image") in her inbox room
When the bot receives the event
Then the message is not processed by any handler

### Scenario: Routing priority order
> Handlers are checked in this order: location, !setup, wizard, inbox, project.

Given the following routing checks:
  1. If msgtype = "m.location" -> LocationHandler (return)
  2. If msgtype != "m.text" -> ignore (return)
  3. If text = "!setup" -> WizardHandler.handleSetupCommand (return)
  4. If isInSetup(userId) -> WizardHandler.handleWizardReply (return)
  5. If roomId in config.rooms.inbox -> InboxHandler (return)
  6. If roomId matches project.matrixRoomId -> ProjectHandler (return)
  7. Otherwise -> silently ignored

Then each incoming event is checked against these rules in order
And the first matching rule handles the event exclusively

### Scenario: Config is re-read on each message for inbox routing
> The inbox room list is loaded fresh from config.yaml on every message.

Given the setup wizard just completed and wrote new inbox rooms to config.yaml
When a message arrives in a newly created inbox room
Then `loadConfigYaml()` is called (not the cached `config` export)
And the new inbox room is recognized and routed to the inbox handler

### Scenario: Bot ignores its own messages
> The bot's user ID is filtered out early to prevent self-processing loops.

Given the bot sends a message (sender = `MATRIX_BOT_USER_ID`)
When the event arrives via the sync loop
Then the event is dropped before any handler is invoked
