// ============================================================
// Vector Clock Utilities
// Used for causal ordering and conflict resolution.
//
// We use vector clocks instead of timestamps because:
//   - Clocks on different devices are unreliable (clock skew)
//   - Vector clocks capture causality — if A happened before B,
//     A's clock will be strictly dominated by B's clock
// ============================================================

export type VectorClock = Record<string, number>;

/**
 * Increment the local device's counter in the clock.
 */
export function increment(clock: VectorClock, deviceId: string): VectorClock {
  return {
    ...clock,
    [deviceId]: (clock[deviceId] ?? 0) + 1,
  };
}

/**
 * Merge two vector clocks by taking the max of each component.
 * Used when receiving events from another device.
 */
export function merge(a: VectorClock, b: VectorClock): VectorClock {
  const result: VectorClock = { ...a };
  for (const [deviceId, counter] of Object.entries(b)) {
    result[deviceId] = Math.max(result[deviceId] ?? 0, counter);
  }
  return result;
}

export type ClockRelation = 'BEFORE' | 'AFTER' | 'CONCURRENT' | 'EQUAL';

/**
 * Compare two vector clocks to determine their causal relationship.
 *
 * Returns:
 *   BEFORE     — a happened before b (a ≤ b component-wise; a is dominated by b)
 *   AFTER      — a happened after b (a ≥ b component-wise; a dominates b)
 *   CONCURRENT — neither dominates (potential conflict!)
 *   EQUAL      — identical clocks
 *
 * Convention: compare(incomingClock, existingClock)
 *   BEFORE  → incoming is stale, ignore
 *   AFTER   → incoming is newer, apply
 *   CONCURRENT → conflict, apply resolution rule
 */
export function compare(a: VectorClock, b: VectorClock): ClockRelation {
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);

  // aLessOrEqual = true means every component of a is ≤ b  (a happened BEFORE or EQUAL to b)
  // bLessOrEqual = true means every component of b is ≤ a  (a happened AFTER or EQUAL to b)
  let aLessOrEqual = true;
  let bLessOrEqual = true;

  for (const key of allKeys) {
    const aVal = a[key] ?? 0;
    const bVal = b[key] ?? 0;
    // a[key] > b[key] means a is NOT ≤ b in this component — so a is not entirely before b
    if (aVal > bVal) aLessOrEqual = false;
    // b[key] > a[key] means b is NOT ≤ a in this component — so a is not entirely after b
    if (bVal > aVal) bLessOrEqual = false;
  }

  if (aLessOrEqual && bLessOrEqual) return 'EQUAL';
  if (aLessOrEqual) return 'BEFORE';  // a ≤ b in all — a happened before b
  if (bLessOrEqual) return 'AFTER';   // b ≤ a in all — a happened after b
  return 'CONCURRENT';
}

/**
 * Check if clock a is dominated by clock b (a <= b component-wise).
 * Used to determine if an event has already been "seen" causally.
 */
export function isDominatedBy(a: VectorClock, b: VectorClock): boolean {
  const rel = compare(a, b);
  return rel === 'BEFORE' || rel === 'EQUAL';
}
