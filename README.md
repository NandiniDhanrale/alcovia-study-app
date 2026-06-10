# Alcovia Offline-First Study App

A production-quality study app with event sourcing, vector clock conflict resolution, idempotent rewards, and exactly-once n8n notifications. Works fully offline and converges to identical state across multiple devices after sync.

---

## Architecture

```
┌─────────────────────┐    ┌─────────────────────┐
│   Device A (Tab 1)  │    │   Device B (Tab 2)   │
│  deviceId: client-a │    │  deviceId: client-b  │
│  Local SQLite DB    │    │  Local SQLite DB     │
│  alcovia-client-a.db│    │  alcovia-client-b.db │
└────────┬────────────┘    └────────┬────────────┘
         │  POST /sync              │  POST /sync
         └──────────┬───────────────┘
                    ▼
         ┌──────────────────────┐
         │   Express Backend     │
         │   SQLite (alcovia.db) │
         │   POST /sync          │
         │   POST /mock-notification │
         │   GET /notifications  │
         └──────────┬────────────┘
                    │ POST /webhook/focus-success
                    ▼
         ┌──────────────────────┐
         │   n8n (port 5678)    │
         │   Check notification_log │
         │   Send once, record  │
         └──────────────────────┘
```

### Core Design: Event Sourcing

Every state mutation creates an **immutable event**. State is never sent directly — only events are exchanged.

```typescript
interface StudyEvent {
  eventId: string;           // UUID — idempotency key
  deviceId: string;          // Origin device
  counter: number;           // Local Lamport counter
  type: EventType;           // What happened
  entityId: string;          // Which entity was affected
  payload: Record<string, unknown>;
  vectorClock: Record<string, number>;  // Causal ordering
  createdAt: string;         // ISO 8601 (informational only)
}
```

### Conflict Resolution: Vector Clocks

We never use wall-clock timestamps for ordering because clocks on different devices can diverge (clock skew). Instead, every mutation increments the local device's counter in a vector clock.

```
Phone:  { phone: 5, laptop: 3 }
Laptop: { phone: 4, laptop: 4 }
→ CONCURRENT! Resolve by business rule: DONE > IN_PROGRESS > NOT_STARTED
```

---

## Setup

### Prerequisites

- Node.js 18+
- Docker Desktop (for n8n)

### 1. Backend

```bash
cd backend
npm install
npm run dev        # Starts on port 3001
```

### 2. Frontend

```bash
cd frontend
npm install
npx expo start --web   # Opens in browser on port 8081
```

**Multi-device simulation**: Open two browser tabs:
- Tab 1: `http://localhost:8081?device=client-a`
- Tab 2: `http://localhost:8081?device=client-b`

Each tab gets an isolated SQLite database and separate device identity.

### Vercel Deploy

This repo is set up to deploy the Expo web app to Vercel from the repository root.

Use these project settings in Vercel:
- `Root Directory`: repository root
- `Build Command`: `cd frontend && npm run build:web`
- `Output Directory`: `frontend/dist`

The static export is created by `expo export --platform web`, which writes the site into `frontend/dist`.
If you create a separate Vercel project pointing directly at `frontend/`, the local `frontend/vercel.json` also works.

### 3. n8n (optional, for notifications)

```bash
# From project root
docker-compose up -d

# Open n8n at http://localhost:5678
# Import the workflow: n8n-workflow.json
# Activate the workflow
```

### 4. Environment Variables

Create `frontend/.env`:
```
EXPO_PUBLIC_API_URL=http://localhost:3001
```

Create `backend/.env`:
```
PORT=3001
N8N_WEBHOOK_URL=http://localhost:5678/webhook/focus-success
```

---

## Running Tests

```bash
cd backend
npm test                    # All 30 tests
npm run test:coverage       # With coverage report
```

### Test Coverage

| Suite | Tests | What it covers |
|---|---|---|
| `sync.test.ts` | 6 | Event deduplication, incremental sync, out-of-order events |
| `conflict.test.ts` | 11 | Vector clocks, DONE > IN_PROGRESS, soft delete wins |
| `rewards.test.ts` | 7 | 50 coins exactly once, replay safety, streak tracking |
| `notifications.test.ts` | 6 | n8n idempotency simulation, PRIMARY KEY uniqueness |

---

## Demo Scenarios

### Scenario 1: Offline Focus Session

1. Open Tab 1 (`?device=client-a`)
2. Go to **Dev Panel** → toggle **Offline**
3. Go to **Focus** → start a 25-minute session
4. Fast-forward (change timer to 1 minute, or wait)
5. Complete session — see coins increase locally
6. Dev Panel → toggle **Online** → watch sync

### Scenario 2: Dual Device Offline

1. Both tabs offline (Dev Panel)
2. Complete a session on each tab
3. Go online on both
4. Sync both
5. Server awards 100 coins total (50 × 2) — not 150 or 200

### Scenario 3: Task Conflict (DONE vs IN_PROGRESS)

1. Tab 1 (`client-a`) → go offline
2. Tab 2 (`client-b`) → go offline
3. Tab 1: Syllabus → mark Task as **DONE**
4. Tab 2: Syllabus → mark same Task as **IN_PROGRESS**
5. Go online on both
6. Sync both → **DONE wins** (completed work never disappears)

### Scenario 4: Duplicate Event Replay

1. Dev Panel → click **"Replay Duplicate Event"**
2. Watch sync logs — server responds "already exists"
3. Coins unchanged — exactly-once guarantee holds

### Scenario 5: Duplicate Notification

1. Trigger the same `SESSION_COMPLETED` event twice
2. n8n checks `notification_log` — second webhook stopped
3. Notifications screen shows exactly one notification

---

## API Reference

### POST /sync

```json
{
  "deviceId": "client-a",
  "lastSyncedSequence": 42,
  "events": [{ ...StudyEvent }]
}
```

Response:
```json
{
  "missingEvents": [{ ...StudyEvent }],
  "serverSequence": 67
}
```

### POST /mock-notification

```json
{
  "eventId": "uuid",
  "sessionId": "uuid",
  "streak": 3,
  "coins": 150
}
```

### GET /notifications

Returns all stored notifications for the UI.

### POST /notification-log/claim

Atomically claims a notification event. Returns `{ claimed: true }` for the single workflow run allowed to send it, otherwise `{ claimed: false }`.

### GET /notification-log/:eventId

Returns the current notification log record for debugging and demo visibility.

### POST /dev/reset

Resets all server state (for demo scenarios).

---

## Project Structure

```
alcovia-study-app/
├── backend/
│   ├── src/
│   │   ├── db/            # SQLite schema + connection
│   │   ├── events/        # Types + event processor
│   │   ├── utils/         # Vector clock
│   │   ├── routes/        # sync.ts, notifications.ts, state.ts
│   │   └── index.ts       # Express server
│   └── tests/             # 30 automated tests
├── frontend/
│   ├── app/               # Expo Router screens
│   │   └── (tabs)/        # Home, Focus, Syllabus, Notifications, Dev
│   └── src/
│       ├── db/            # Local SQLite schema + database.ts
│       ├── events/        # types, eventStore, eventProcessor
│       ├── sync/          # syncEngine.ts
│       ├── features/      # focus/, syllabus/
│       ├── store/         # Zustand global state
│       └── utils/         # deviceId, vectorClock, idGenerator
├── n8n/
│   └── workflow.json      # Source n8n workflow
├── docker-compose.yml
├── README.md
└── DECISIONS.md
```
