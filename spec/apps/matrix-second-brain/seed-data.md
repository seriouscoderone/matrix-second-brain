# Seed Data — matrix-second-brain

This file defines the test users, credentials, and pre-seeded database records required for the BDD test suite to run. The test agent reads this file to know how to authenticate and what state exists at the start of each scenario.

> **Note**: This is a Matrix bot service, not a web app. "Authentication" means obtaining a Matrix access token via `/_matrix/client/v3/login`, not a browser login page. The test agent sends Matrix API calls and reads bot replies via the sync API.

---

## Matrix Homeserver

| Setting | Value |
|---------|-------|
| `base_url` | `http://localhost:8008` (local dev) |
| Matrix domain | `localhost` |
| Registration | Open (no verification required in dev) |

---

## Test Users

| Role | Matrix ID | Username | Password | Description |
|------|-----------|----------|----------|-------------|
| Admin | `@admin:localhost` | `admin` | `adminpassword123` | Runs `!setup`, owns the Space |
| HouseholdMember (alice) | `@alice:localhost` | `alice` | `alicepassword123` | Primary test user, has own inbox room |
| HouseholdMember (bob) | `@bob:localhost` | `bob` | `bobpassword123` | Secondary user, has own inbox room |
| Bot (service account) | `@secondbrain:localhost` | `secondbrain` | `botpassword123` | The bot itself — never send as this user |

**Obtaining an access token:**
```python
import urllib.request, json

def get_token(username, password, base_url="http://localhost:8008"):
    payload = json.dumps({
        "type": "m.login.password",
        "user": username,
        "password": password
    }).encode()
    req = urllib.request.Request(
        f"{base_url}/_matrix/client/v3/login",
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())["access_token"]
```

---

## Pre-Seeded Room State (after setup wizard)

After the setup wizard runs successfully, the following rooms exist:

| Room | Alias | Description |
|------|-------|-------------|
| Space | `#second-brain-space:localhost` | The Matrix Space containing all rooms |
| Digest room | `#digest:localhost` | Receives daily/weekly digests |
| Alice's inbox | `#inbox-alice:localhost` | Alice's inbox — routes to AI pipeline |
| Bob's inbox | `#inbox-bob:localhost` | Bob's inbox — routes to AI pipeline |
| Project room (test) | `#project-kitchen-remodel:localhost` | Pre-created project room for project-room tests |

> **Important**: Room IDs (not aliases) must be URL-encoded in HTTP paths: `!roomid:localhost` → `%21roomid%3Alocalhost`.

---

## Pre-Seeded Database Records

The following records are inserted before the test suite runs (to support feature scenarios that have `Given` preconditions referencing existing data).

### Projects

| Name | Owner | Status | nextAction | matrixRoomId | Notes |
|------|-------|--------|------------|--------------|-------|
| Kitchen Remodel | shared | active | null | `#project-kitchen-remodel:localhost` room ID | Used in project-room-messaging tests |
| Website Redesign | alice | active | null | null | Used in weekly-review stale detection tests (created 21 days ago) |
| Tax Prep | bob | active | Gather W-2s | null | Used in weekly-review (not stale, has nextAction) |
| Archived Project | alice | archived | null | null | Used in weekly-review non-active test (created 60 days ago) |

### Places

| Name | Latitude | Longitude | Address |
|------|----------|-----------|---------|
| Trader Joe's | 37.7749 | -122.4194 | Test address |
| Costco | 37.8044 | -122.2712 | Test address |
| Hardware Store | 37.7760 | -122.4180 | Test address |

### Shopping Items

| Item | Place | Status | Owner | CreatedBy |
|------|-------|--------|-------|-----------|
| Coffee beans | Trader Joe's | pending | shared | bob |
| Almond milk | Trader Joe's | pending | shared | alice |
| Bulk paper towels | Costco | purchased | shared | alice |
| Drill bits | Hardware Store | pending | shared | bob |

### Tasks

| Title | Owner | Status | DueDate | Priority | ProjectId |
|-------|-------|--------|---------|----------|-----------|
| Call dentist | alice | pending | 3 days ago | medium | null |
| Overdue Item | bob | pending | 5 days ago | high | null |
| Fix leaky faucet | alice | pending | today | high | null |
| Submit tax forms | bob | pending | today | medium | null |

### Events

| Title | StartAt | Location | Owner |
|-------|---------|----------|-------|
| Dentist | today 14:00 | Main St Dental | alice |
| Team Call | today 09:30 | null | shared |
| Lunch | today 12:00 | Cafe Roma | shared |

### Contacts

| Name | Company | Email | Owner | CreatedBy |
|------|---------|-------|-------|-----------|
| Sarah | Acme Corp | sarah@acme.com | shared | alice |
| Bob | null | null | alice | alice |

### Waiting For

| Title | FollowUpDate | Owner |
|-------|-------------|-------|
| Plumber quote | today | bob |

### Someday Maybe

| Title | ReviewDate | Owner |
|-------|-----------|-------|
| Learn Spanish | 5 days ago | shared |
| Learn woodworking | 90 days from now | alice |

### Inbox Items (for enrichment-cron tests)

| ID | RawContent | Status | CreatedAt |
|----|-----------|--------|-----------|
| test-inbox-stale | This is a test message that is quite long and should be truncated for display purposes | new | 10 minutes ago |
| test-inbox-recent | Recent message | new | 2 minutes ago |
| test-inbox-processed | Old processed item | processed | 30 minutes ago |

### Location Cooldowns (for proximity tests)

| UserId | PlaceId | LastAlertedAt |
|--------|---------|---------------|
| `@alice:localhost` | Trader Joe's | 30 minutes ago (cooldown active) |

---

## Config (config.yaml) State

After setup wizard completion:

```yaml
space:
  id: "!<space-room-id>:localhost"
  name: "Test Second Brain"

rooms:
  digest: "!<digest-room-id>:localhost"
  inbox:
    alice: "!<inbox-alice-room-id>:localhost"
    bob: "!<inbox-bob-room-id>:localhost"

users:
  - "@alice:localhost"
  - "@bob:localhost"

cron:
  daily_digest: "0 8 * * *"
  weekly_review: "0 9 * * 1"
  enrichment: "0 */6 * * *"
```

---

## Test Execution Notes for the Test Agent

### Sending a Matrix message
```python
import urllib.request, json

def send_message(room_id, body, token, base_url="http://localhost:8008"):
    import time, random
    txn_id = f"test-{int(time.time())}-{random.randint(1000,9999)}"
    encoded_room = urllib.parse.quote(room_id, safe="")
    payload = json.dumps({"msgtype": "m.text", "body": body}).encode()
    req = urllib.request.Request(
        f"{base_url}/_matrix/client/v3/rooms/{encoded_room}/send/m.room.message/{txn_id}",
        data=payload,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="PUT"
    )
    return json.loads(urllib.request.urlopen(req).read())
```

### Reading the bot's reply (poll sync)
Poll `/_matrix/client/v3/sync?timeout=10000` with the user's token and watch for `m.room.message` events from `@secondbrain:localhost` in the target room. Allow up to 15 seconds for the bot to reply after sending a message.

### Sending a location event
```python
def send_location(room_id, lat, lon, token, base_url="http://localhost:8008"):
    import time, random, urllib.parse
    txn_id = f"loc-{int(time.time())}-{random.randint(1000,9999)}"
    encoded_room = urllib.parse.quote(room_id, safe="")
    geo_uri = f"geo:{lat},{lon}"
    payload = json.dumps({
        "msgtype": "m.location",
        "body": geo_uri,
        "geo_uri": geo_uri,
        "org.matrix.msc3488.location": {"uri": geo_uri}
    }).encode()
    req = urllib.request.Request(
        f"{base_url}/_matrix/client/v3/rooms/{encoded_room}/send/m.room.message/{txn_id}",
        data=payload,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="PUT"
    )
    return json.loads(urllib.request.urlopen(req).read())
```

### Triggering cron jobs manually (for cron scenarios)
The bot exposes no HTTP admin API. To trigger cron scenarios deterministically, use one of:
1. Set the cron schedule to `* * * * *` (every minute) in `.env.dev` and wait for it to fire
2. Directly call the cron handler function via a test endpoint (if one is added)
3. Pre-seed the correct DB state and verify results via direct DB query rather than bot reply
