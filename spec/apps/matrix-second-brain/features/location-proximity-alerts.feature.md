# Feature: Location Proximity Alerts

## User Story
As a HouseholdMember
I want to receive a reminder when I am near a store where I have pending shopping items
So that I can make a stop and pick up what I need without forgetting.

## Background
Given the bot is running and the setup wizard has completed
And the database contains Places with coordinates
And some Places have pending ShoppingItems linked via `placeId`
And `ALERT_RADIUS_METERS` is configured (default 500)
And `LOCATION_COOLDOWN_MINUTES` is configured (default 120)

## Scenarios

### Scenario: User near a store with pending items receives an alert
> A location event within the alert radius triggers a shopping reminder.

Given a Place "Trader Joe's" exists at coordinates (37.7749, -122.4194)
And a pending ShoppingItem "Coffee beans" is linked to "Trader Joe's" with createdBy "bob"
And a pending ShoppingItem "Almond milk" is linked to "Trader Joe's" with createdBy "alice"
And no cooldown exists for alice + "Trader Joe's"
When alice shares her location at coordinates (37.7751, -122.4190) (within 500m)
Then the bot calculates the Haversine distance as approximately 50 meters
And the bot sends a message to the room: "Hey! You're near Trader Joe's (~50m). You have items on your list there:\n  - Coffee beans -- added by bob\n  - Almond milk\nWorth a stop if you have time!"
And the bot records a cooldown for alice + "Trader Joe's" at the current timestamp

### Scenario: User near a store but cooldown has not expired
> No alert is sent if the user was alerted recently for the same place.

Given a Place "Trader Joe's" exists within range
And pending ShoppingItems are linked to it
And a cooldown record exists for alice + "Trader Joe's" from 30 minutes ago
And `LOCATION_COOLDOWN_MINUTES` is 120
When alice shares her location near "Trader Joe's"
Then the bot calculates the user is within range
But the cooldown check returns false (30 min < 120 min threshold)
And no alert message is sent

### Scenario: User near a store after cooldown has expired
> Alert is sent again after the cooldown period expires.

Given a Place "Trader Joe's" exists within range
And pending ShoppingItems are linked to it
And a cooldown record exists for alice + "Trader Joe's" from 150 minutes ago
And `LOCATION_COOLDOWN_MINUTES` is 120
When alice shares her location near "Trader Joe's"
Then the cooldown check returns true (150 min > 120 min threshold)
And the bot sends the proximity alert
And the cooldown record is updated (upserted) with the current timestamp

### Scenario: User near a store with no pending items
> No alert is sent if all shopping items at the place are purchased.

Given a Place "Costco" exists within range
And all ShoppingItems linked to "Costco" have `status = 'purchased'`
When alice shares her location near "Costco"
Then the proximity engine finds no pending items for "Costco"
And no alert message is sent

### Scenario: User not near any store
> No alerts when the user is far from all places.

Given Places exist but all are more than 500 meters from the user's location
When alice shares her location
Then the Haversine distance to all places exceeds `ALERT_RADIUS_METERS`
And no alert messages are sent

### Scenario: Multiple stores within range
> User is near multiple places with pending items.

Given "Trader Joe's" is 100m away with 2 pending items
And "Hardware Store" is 300m away with 1 pending item
And no cooldowns exist for either place
When alice shares her location
Then the bot sends two separate alert messages, one for each place
And two cooldown records are created

### Scenario: Location event with invalid geo_uri
> Malformed location data is logged and ignored.

Given a user shares a location event
But the `geo_uri` field is "invalid-format"
When the bot receives the event
Then the geo_uri parser returns null
And no proximity check is performed
And a warning is logged

### Scenario: Location event via MSC3488 format
> The bot supports the newer MSC3488 location format as a fallback.

Given a user shares a location with `org.matrix.msc3488.location.uri` set to "geo:37.7749,-122.4194"
And the `geo_uri` field is empty
When the bot receives the event
Then the bot extracts coordinates from the MSC3488 field
And the proximity check proceeds normally

### Scenario: Shopping items show creator attribution
> Items added by a different user show "added by" attribution.

Given alice is near "Trader Joe's"
And a pending item "Eggs" was created by bob
And a pending item "Milk" was created by alice
When alice receives the proximity alert
Then "Eggs" is shown as "Eggs -- added by bob"
And "Milk" is shown without attribution (alice created it herself)

### Scenario: Cooldown is per-user, not global
> Each user has independent cooldowns.

Given alice was alerted about "Trader Joe's" 30 minutes ago (cooldown active)
And bob has never been alerted about "Trader Joe's"
When bob shares his location near "Trader Joe's"
Then bob receives a proximity alert (his cooldown is clear)
And alice would not receive an alert if she shared her location (her cooldown is active)

### Scenario Outline: Haversine distance calculation edge cases
> The distance calculation handles various coordinate scenarios.

Given a Place exists at coordinates (<place_lat>, <place_lon>)
When a user shares location at (<user_lat>, <user_lon>)
Then the calculated distance is approximately <distance_m> meters

Examples:
| place_lat | place_lon | user_lat | user_lon | distance_m |
| 37.7749 | -122.4194 | 37.7749 | -122.4194 | 0 |
| 37.7749 | -122.4194 | 37.7751 | -122.4190 | ~50 |
| 37.7749 | -122.4194 | 37.7800 | -122.4100 | ~1000 |
| 0.0000 | 0.0000 | 0.0001 | 0.0001 | ~16 |
