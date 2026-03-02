# Feature: Clarification Flow

## User Story
As a HouseholdMember
I want the bot to ask me clarifying questions when my message is too vague
So that the resulting record is accurate rather than a guess.

## Background
Given the bot is running and the setup wizard has completed
And I am in my configured inbox room
And the LLM provider is available

## Scenarios

### Scenario: Ambiguous message triggers clarification
> The AI determines the message needs clarification and asks follow-up questions.

Given I am in my inbox room
When I send "thing about the stuff next week"
Then the AI pipeline Stage 1 (clarify) returns `needsClarification = true` with confidence > 0.5
And the bot replies in-thread with the clarifying questions (e.g., "What thing are you referring to?", "What stuff?")
And the bot stores a pending clarification for my user ID with the original message and room context

### Scenario: User replies to clarification and message is re-processed
> The user's clarification response is merged with the original message and re-classified.

Given I sent an ambiguous message and the bot asked clarifying questions
And a pending clarification exists for my user ID
When I send a reply in the same inbox room (e.g., "I meant the dentist appointment next Tuesday")
Then the bot merges my original message with the clarification: "Original message: thing about the stuff next week\nClarification: I meant the dentist appointment next Tuesday"
And the merged message is processed by the AI pipeline starting at Stage 3 (classify), skipping Stage 1 (clarify)
And the bot classifies the merged message (e.g., as `event`) and saves it
And the bot replies in-thread with a confirmation
And the pending clarification for my user ID is cleared

### Scenario: Clarification is single-round only
> The bot does not ask for clarification on the clarification reply.

Given I sent an ambiguous message and the bot asked clarifying questions
When I reply with another vague message "the other thing"
Then the bot merges the messages and classifies the combined text
And the bot does NOT ask for a second round of clarification (Stage 1 is skipped)
And the result may have lower confidence but is saved regardless

### Scenario: Clear message does not trigger clarification
> Straightforward messages bypass the clarification stage.

Given I am in my inbox room
When I send "Buy eggs at the grocery store"
Then the AI pipeline Stage 1 returns `needsClarification = false`
And the pipeline proceeds directly to classification (Stage 3)
And no clarifying questions are sent

### Scenario: Clarification check returns needsClarification with low confidence
> If the clarification confidence is 0.5 or below, proceed without asking.

Given I am in my inbox room
When I send a slightly ambiguous message
And the AI pipeline Stage 1 returns `needsClarification = true` but `confidence = 0.3`
Then the pipeline does NOT ask for clarification (confidence threshold is > 0.5)
And the pipeline proceeds to classification

### Scenario: Clarification check fails with an exception
> If the clarify LLM call throws an error, the pipeline proceeds with classification.

Given I am in my inbox room
And the LLM provider throws an error on the clarification call
When I send "Schedule a meeting with the team"
Then the pipeline logs a warning "Clarification check failed, proceeding"
And the pipeline proceeds to classification at Stage 3
And the message is classified and saved normally

### Scenario: Pending clarification is room-scoped
> A pending clarification only matches replies in the same room.

Given I sent an ambiguous message in my inbox room and a clarification is pending
When I send a message in a different room (e.g., a project room)
Then the message in the other room is NOT treated as a clarification reply
And the pending clarification remains active for my inbox room

### Scenario: Only one pending clarification per user
> If a user sends a new message while a clarification is pending, the new message creates a new flow.

Given I sent an ambiguous message and a clarification is pending for my user ID
When I send a new, unrelated message in the same inbox room
Then the pending clarification is consumed (since any reply in the same room matches)
And the new message is treated as a clarification reply to the original
And the merged text is classified

### Scenario: Bot restart clears pending clarifications
> Pending clarifications are stored in memory and lost on restart.

Given a pending clarification exists for my user ID
When the bot process restarts
Then the pending clarification no longer exists
And if I send a message in my inbox room, it is treated as a new message (not a clarification reply)
