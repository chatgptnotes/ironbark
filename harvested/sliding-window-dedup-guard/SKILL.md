---
name: Sliding Window Dedup Guard
description: Time-windowed event counting with three dedup layers (memory Map, database query, cooldown period) for rate-sensitive detectors that must avoid duplicate actions
source_project: nexaproc
projects_used_in: [nexaproc]
tags: [typescript, nodejs, rate-limiting, dedup, sliding-window, pattern, real-time]
harvested: 2026-04-15
---

# Sliding Window Dedup Guard

Count events per entity over a sliding time window. When the count crosses a threshold, trigger an action — but ensure that action fires at most once per cooldown period using three dedup layers.

## When to Use

- Detecting repeated conditions (alarm chattering, error spikes, retry storms)
- Triggering actions (notifications, analysis, escalation) that should fire once, not per-event
- Any system where the same entity generates high-frequency events but you only want to act periodically

## The Pattern

### Data Structures

```typescript
interface EventWindow {
  readonly entityId: string;
  readonly timestamps: readonly number[];  // ms, pruned to window size
}

interface GuardConfig {
  readonly windowMs: number;        // Sliding window size (e.g., 86_400_000 = 24h)
  readonly threshold: number;       // Minimum events to trigger (e.g., 10)
  readonly cooldownMs: number;      // Minimum time between actions (e.g., 172_800_000 = 48h)
}
```

### Module State

```typescript
// In-memory sliding windows — one per entity
const windows = new Map<string, EventWindow>();

// In-memory action timestamps — cheapest dedup layer
const lastActionAt = new Map<string, number>();
```

### Recording Events (Called from Hot Path)

```typescript
export function recordEvent(entityId: string, context: EntityContext): void {
  const now = Date.now();
  const existing = windows.get(entityId);

  // Immutable update — prune expired, append new
  const pruned = (existing?.timestamps ?? []).filter(
    (ts) => now - ts < config.windowMs,
  );
  const updated: EventWindow = {
    entityId,
    timestamps: [...pruned, now],
  };
  windows.set(entityId, updated);

  // Threshold check
  if (updated.timestamps.length >= config.threshold) {
    void triggerAction(entityId, context, updated.timestamps.length)
      .catch((err) => logger.error({ entityId, err }, 'Action failed'));
  }
}
```

### Three-Layer Dedup

```typescript
async function triggerAction(
  entityId: string,
  context: EntityContext,
  count: number,
): Promise<void> {
  // Layer 1: Memory dedup (O(1), no I/O)
  const lastAction = lastActionAt.get(entityId);
  if (lastAction && Date.now() - lastAction < config.cooldownMs) {
    return;
  }

  // Layer 2: Database dedup (survives restarts)
  const pending = await db.actionRecord.findFirst({
    where: {
      entityId,
      status: { in: ['pending', 'draft'] },
      createdAt: { gte: new Date(Date.now() - config.cooldownMs) },
    },
  });
  if (pending) {
    // Sync memory with DB (in case we just restarted)
    lastActionAt.set(entityId, pending.createdAt.getTime());
    return;
  }

  // Layer 3: Domain-specific guard (optional)
  if (await shouldSkipForDomainReason(entityId, context)) {
    return;
  }

  // All guards passed — execute the action
  const record = await executeAction(entityId, context, count);

  // Update memory dedup
  lastActionAt.set(entityId, Date.now());
}
```

## Why Three Layers

| Layer | Cost | Survives Restart | Purpose |
|-------|------|-----------------|---------|
| Memory Map | O(1), no I/O | No | Eliminates 99% of duplicate checks instantly |
| Database Query | O(1), 1 query | Yes | Catches duplicates after process restart |
| Domain Guard | O(N), domain-specific | N/A | Prevents false positives from domain conditions |

**Ordering matters**: cheapest guard first. If the memory check eliminates the candidate, we never hit the database.

## Window Pruning Strategy

```typescript
// GOOD: Prune on every write — O(N) but N is bounded by window size
const pruned = timestamps.filter(ts => now - ts < windowMs);

// BAD: Prune on a timer — stale data between prune cycles
setInterval(() => pruneAll(), 60000);  // Don't do this

// BAD: Never prune — unbounded memory growth
timestamps.push(now);  // Leaks memory over days
```

Pruning on every write keeps memory bounded. For a 24h window with 1-second events, that's at most 86,400 entries per entity — trivial for a Map.

## Reset for Testing

```typescript
export function resetState(): void {
  windows.clear();
  lastActionAt.clear();
}
```

Always expose a reset function for test isolation. Without it, test order affects results.

## Concrete Examples

### Alarm Chattering (SCADA)

```typescript
const config: GuardConfig = {
  windowMs: 86_400_000,    // 24 hours (ISA 18.2 chattering definition)
  threshold: 10,           // >10 state changes = chattering
  cooldownMs: 172_800_000, // 48h between recommendations
};
```
Domain guard: skip if the process variable shows a genuine 3σ change (real upset, not noise).

### Error Spike Detection (API)

```typescript
const config: GuardConfig = {
  windowMs: 300_000,     // 5 minutes
  threshold: 50,         // >50 errors = spike
  cooldownMs: 900_000,   // 15 min between alerts
};
```
Domain guard: skip if a deployment is in progress (errors expected during rollout).

### Retry Storm Detection (Queue)

```typescript
const config: GuardConfig = {
  windowMs: 60_000,      // 1 minute
  threshold: 20,         // >20 retries = storm
  cooldownMs: 300_000,   // 5 min between circuit-breaker triggers
};
```
Domain guard: skip if the downstream service is in maintenance mode.

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Pattern |
|-------------|---------------|-----------------|
| Only memory dedup | Lost on restart → duplicate actions | Memory + DB |
| Only DB dedup | Extra query for every high-frequency event | Memory first, DB second |
| Mutable array push | Violates immutability, harder to reason about | `[...pruned, now]` |
| Fixed window (not sliding) | Boundary effects — events at window edge trigger twice | Sliding window with per-event prune |
| No cooldown, just "once per window" | Window resets after action → immediate re-trigger | Separate cooldown period longer than window |
| No test reset function | Tests leak state between runs | `resetState()` export |
