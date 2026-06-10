// ============================================================
// Vector Clock Utilities — Frontend
// Identical implementation to backend (no shared package for simplicity)
// ============================================================

export type VectorClock = Record<string, number>;
export type ClockRelation = 'BEFORE' | 'AFTER' | 'CONCURRENT' | 'EQUAL';

export function increment(clock: VectorClock, deviceId: string): VectorClock {
  return { ...clock, [deviceId]: (clock[deviceId] ?? 0) + 1 };
}

export function merge(a: VectorClock, b: VectorClock): VectorClock {
  const result: VectorClock = { ...a };
  for (const [deviceId, counter] of Object.entries(b)) {
    result[deviceId] = Math.max(result[deviceId] ?? 0, counter);
  }
  return result;
}

/**
 * Compare two vector clocks.
 * BEFORE = a happened before b (a ≤ b everywhere)
 * AFTER  = a happened after b  (a ≥ b everywhere)
 * CONCURRENT = conflict
 */
export function compare(a: VectorClock, b: VectorClock): ClockRelation {
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);

  let aLessOrEqual = true; // a ≤ b in all components (a BEFORE b)
  let bLessOrEqual = true; // b ≤ a in all components (a AFTER b)

  for (const key of allKeys) {
    const aVal = a[key] ?? 0;
    const bVal = b[key] ?? 0;
    if (aVal > bVal) aLessOrEqual = false;
    if (bVal > aVal) bLessOrEqual = false;
  }

  if (aLessOrEqual && bLessOrEqual) return 'EQUAL';
  if (aLessOrEqual) return 'BEFORE';
  if (bLessOrEqual) return 'AFTER';
  return 'CONCURRENT';
}
