# Feature: Setup Wizard

## User Story
As an Admin
I want to run a guided setup wizard via `!setup`
So that the bot creates a Matrix Space with inbox rooms, a digest room, and a saved configuration for all household members.

## Background
Given the bot is running and connected to the Matrix homeserver
And the database migrations have completed
And no `config.yaml` exists (or setup has not been run)

## Scenarios

### Scenario: Admin initiates setup wizard
> The admin sends `!setup` and receives the first wizard prompt.

Given I am logged in as the admin user (`ADMIN_MATRIX_ID`)
When I send `!setup` in any room
Then the bot replies "Let's set up your Second Brain. What should I name your Space?"
And the bot records my wizard state as `space_name` step

### Scenario: Admin provides space name and is prompted for users
> The admin answers the space name prompt and proceeds to user invitation.

Given I am in the setup wizard at the `space_name` step
When I send "Family Brain"
Then the bot records "Family Brain" as the space name
And the bot replies asking for Matrix IDs of other users (comma-separated) or "just me"
And my wizard state advances to the `invite_users` step

### Scenario: Admin invites additional users
> The admin provides Matrix IDs for other household members.

Given I am in the setup wizard at the `invite_users` step
And the space name is "Family Brain"
When I send "@bob:localhost"
Then the bot creates a Matrix Space named "Family Brain"
And the bot invites all users (admin + bob) to the Space
And the bot creates a `#digest` room, invites all users, and adds it to the Space
And the bot creates inbox rooms: `#inbox-admin_username` and `#inbox-bob`
And the bot adds all inbox rooms to the Space
And the bot saves `config.yaml` with space ID, room IDs, user list, and default cron schedules
And the bot replies with a success message listing all created rooms
And my wizard state is cleared

### Scenario: Admin chooses "just me"
> The admin is the only user.

Given I am in the setup wizard at the `invite_users` step
When I send "just me"
Then the bot creates a Space and invites the admin to it
And the bot creates a digest room, adds it to the Space
And the bot creates one inbox room for the admin and adds it to the Space
And the bot saves `config.yaml` with only the admin in the users list
And the bot replies with a success message

### Scenario: All rooms appear under the Space in Element
> Space child/parent events have valid `via` fields so clients render the hierarchy.

Given the setup wizard has completed with Space "Family Brain"
When I open Element and view the Space
Then the digest room and all inbox rooms appear nested under the Space
And each room's `m.space.child` event on the Space has `via: ["<homeserver_domain>"]`
And each room's `m.space.parent` event has `via: ["<homeserver_domain>"]`
And the homeserver domain is extracted from the Space ID (e.g. `!abc:example.com` → `example.com`)

### Scenario: Users are invited to the Space itself
> All users must be members of the Space to see it and its child rooms.

Given the setup wizard creates a Space
When the wizard finishes
Then all users in the invite list are invited to the Space (not just to individual rooms)
And the bot (as Space creator) is already a member without needing an invite

### Scenario: Non-admin user attempts setup
> A regular household member tries to run `!setup`.

Given I am logged in as a non-admin user
When I send `!setup` in any room
Then the bot replies "Only the admin can run `!setup`."
And no wizard state is created for my user

### Scenario: Setup fails due to room creation error
> The Matrix homeserver returns an error during room creation.

Given I am the admin in the setup wizard at the `invite_users` step
And the Matrix homeserver is returning errors for room creation
When I send "@bob:localhost"
Then the bot replies with an error message including the failure reason
And my wizard state is cleared
And no `config.yaml` is written

### Scenario: Bot restart clears wizard state
> Wizard state is in-memory and lost on restart.

Given I am the admin in the setup wizard at the `invite_users` step
When the bot process restarts
Then my wizard state no longer exists
And if I send a message, it is not routed to the wizard handler

### Scenario Outline: Invalid user IDs in invite step
> The wizard filters out non-Matrix-ID strings from the invite list.

Given I am in the setup wizard at the `invite_users` step
When I send "<input>"
Then the bot invites <valid_count> users
And ignores strings that do not start with "@"

Examples:
| input | valid_count |
| @bob:localhost, @carol:localhost | 3 (admin + bob + carol) |
| bob, @carol:localhost | 2 (admin + carol) |
| just me | 1 (admin only) |
