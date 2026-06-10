# Architecture Decision Records

---

## 1. Event Sourcing

### Decision
Use event sourcing instead of synchronizing final state.

### Rationale
When two devices go offline and make changes, simply comparing final state creates irreconcilable conflicts:
- Device A: `{ task: DONE, coins: 100 }`
- Device B: `{ task: IN_PROGRESS, coins: 50 }`

Which one is "correct"? You can't know without history.

Event sourcing gives us the full history:
```
Device A: [TASK_STARTED, TASK_DONE, SESSION_COMPLETED]
Device B: [SESSION_STARTED, TASK_IN_PROGRESS]
```

Now we can merge them deterministically. Events are the source of truth; state is a derived projection.

### Benefits
- **Audit trail**: Every mutation is recorded immutably
- **Time travel**: Replay events to reconstruct any historical state
- **Offline-first**: Devices accumulate events locally; server merges them
- **Idempotency**: `eventId` provides a natural deduplication key
- **Conflict visibility**: Concurrent events are explicit, not silently overwritten

---

## 2. Vector Clocks Instead of Timestamps

### Decision
Use vector clocks for causal ordering, never wall-clock timestamps.

### Rationale
Wall-clock timestamps on different devices cannot be trusted:
- Clock skew between devices (even NTP-synchronized clocks differ by ms–seconds)
- Users can manually change system time
- A timestamp doesn't tell you *causality* — did event A cause event B, or did they happen independently?

Vector clocks capture causality precisely:
```typescript
type VectorClock = Record<string, number>;

// phone makes a change:
phone_clock = { phone: 1 }

// laptop makes a change:
laptop_clock = { laptop: 1 }

// Both are concurrent — neither has seen the other
compare({ phone: 1 }, { laptop: 1 }) → CONCURRENT

// After sync, phone makes another change:
phone_clock = { phone: 2, laptop: 1 }
// This AFTER the laptop's change — clear causality
```

### The Algorithm
```
compare(a, b):
  aLessOrEqual = every a[k] ≤ b[k]
  bLessOrEqual = every b[k] ≤ a[k]

  if both: EQUAL
  if aLessOrEqual: BEFORE (a happened before b)
  if bLessOrEqual: AFTER  (a happened after b)
  else: CONCURRENT (conflict)
```

---

## 3. Conflict Resolution Strategy

### Decision
For task status conflicts, use a priority rule: `DONE > IN_PROGRESS > NOT_STARTED`.

### Rationale
**The invariant we want to protect**: Completed work should never disappear.

If Student A marks a task DONE (offline), and Student B marks it IN_PROGRESS (also offline), and then they sync — the DONE state should win. The student who completed it shouldn't see their work "un-completed".

This is a **monotonic** approach: task status can only ever increase in priority. This is similar to a CRDT (Conflict-free Replicated Data Type) — specifically a state-based grow-only set.

### For Deletions
Soft-delete wins over any concurrent edit. Rationale: if a user deleted a task, they made an intentional choice. An edit from another device (which was unaware of the deletion) should not resurrect it.

```typescript
// Deletion wins — even over DONE status
if (existing.deleted) return; // Skip the edit entirely
```

---

## 4. Reward Idempotency

### Decision
Use a `processed_events` table as an idempotency guard on the server. Never award coins based on receiving an event alone — check the table first.

### Rationale
Without idempotency:
1. Client syncs `SESSION_COMPLETED` → server awards 50 coins
2. Client retries sync (network blip) → server processes again → 100 coins
3. Client A and Client B both have the same event → 150 coins

The `processed_events` table prevents this:

```sql
CREATE TABLE processed_events (eventId TEXT PRIMARY KEY);

-- Before awarding:
SELECT 1 FROM processed_events WHERE eventId = ?;
-- If found: skip
-- If not: award coins, INSERT INTO processed_events
```

Because `eventId` is a UUID generated at event creation time, it's globally unique and immutable. This makes the award operation **exactly-once**.

### Why Server-Side?
Clients optimistically show the reward immediately (UX), but the server is the authoritative source. If a client sees 50 coins, and they sync, the server confirms exactly 50. If the client tries to sync the same event again, the server ignores it — coins stay at 50.

---

## 5. Notification Idempotency via n8n

### Decision
n8n workflow atomically claims `eventId` in `notification_log` before sending, then marks the row as sent.

### Rationale
Webhooks can be triggered multiple times (retries, network errors, duplicate events). Without idempotency, the student could get 5 "Congratulations!" messages for a single session.

```
n8n workflow:
1. Receive webhook (eventId, sessionId, streak, coins)
2. POST /notification-log/claim { eventId } → exactly one run gets { claimed: true }
3. If claimed=false → stop, return "skipped"
4. POST /mock-notification → deliver notification
5. POST /notification-log → mark sentAt
6. Return "sent"
```

The `notification_log.eventId` `PRIMARY KEY` makes step 2 atomic. This closes the race that a check-then-send flow would have under concurrent webhook deliveries.

---

## 6. Incremental Sync Strategy

### Decision
Use server-assigned `sequenceNumber` as a watermark. Clients store `lastSyncedSequence` and only request events after that point.

### Rationale
Naive sync sends the entire event log every time — O(n) bandwidth and processing. Incremental sync is O(new events):

```typescript
// Client sends:
{ lastSyncedSequence: 42, events: [unsyncedLocalEvents] }

// Server returns:
{ missingEvents: [events where sequenceNumber > 42], serverSequence: 67 }

// Client stores:
lastSyncedSequence = 67
```

This scales to thousands of events across many sessions without degrading.

---

## 7. Multi-Device Simulation via URL Params

### Decision
On web, read `?device=client-a` from the URL to set device identity without requiring actual separate devices.

### Rationale
The spec requires demonstrating offline sync between two devices. Running two physical devices or two simulators is complex. Two browser tabs with isolated state (separate SQLite databases, separate device IDs) provide a clean demo environment.

Each device gets its own SQLite database file:
```
alcovia-client-a.db  (Tab 1)
alcovia-client-b.db  (Tab 2)
```

They share no state except through the server.

---

## 8. Tradeoffs and Limitations

### Vector Clocks Scale
Vector clocks grow with the number of devices. For a student app with 2-5 devices, this is negligible. For 1000s of devices, you'd use version vectors or hybrid logical clocks.

### Optimistic Local Rewards
The frontend shows +50 coins immediately before server confirmation. If the server rejects the event (malformed, etc.), the displayed count will be wrong until the next sync. For a student app, this UX tradeoff is worth it.

### No Authentication
The spec requires `studentId = "student-1"`. A production app would use JWT or OAuth. The sync endpoint would verify the token and scope events to the authenticated user.

### Soft Delete vs Hard Delete
Soft deletes mean the database grows over time. A production system would need a compaction/garbage collection strategy to archive or hard-delete records after a grace period.

### n8n Reliability
If the workflow claims an event and then fails before sending, the current design prefers at-most-once notification delivery over retries that could duplicate messages. A production system would keep this in an outbox/queue with retries and dead-letter handling.

### SQLite on Web
Expo SQLite uses WebSQL/OPFS on web, which has per-origin storage limits (~1GB). For a study app this is more than adequate, but note it's not shared across different origins.
