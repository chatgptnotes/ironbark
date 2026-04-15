---
name: Async AI Advisory on Real-Time Hot Path
description: Pattern for void-launching AI analysis from time-critical control loops (alarm engines, tag processors) with dedup guards, cooldown periods, and process-change detection to prevent false positives
source_project: nexaproc
projects_used_in: [nexaproc]
tags: [typescript, nodejs, ai, real-time, scada, industrial, alarm, async, event-driven]
harvested: 2026-04-15
---

# Async AI Advisory on Real-Time Hot Path

Add AI-powered analysis to real-time processing loops without blocking the hot path. The AI call is fire-and-forget with three guard layers to prevent unnecessary or duplicate invocations.

## When to Use

- Adding AI analysis to an event-driven system where event processing must stay <1ms
- Any real-time loop (alarm engine, sensor pipeline, trade engine) where you want AI recommendations without latency impact
- Systems where the same condition may trigger repeatedly and you need dedup

## The Core Pattern

```typescript
// Called synchronously from the hot path (alarm engine, tag processor, etc.)
export function recordAdvisorTransition(entityId: string, context: EntityContext): void {
  // 1. Update the sliding window (O(1) amortized)
  const window = updateSlidingWindow(entityId);

  // 2. Threshold check — only fire AI when count crosses threshold
  if (window.count < THRESHOLD) return;

  // 3. CRITICAL: void-launch — NEVER await in the hot path
  void runAnalysis(entityId, context).catch((err) =>
    logger.error({ entityId, err }, 'Advisory analysis failed'),
  );
}
```

**Why `void` and not `await`**: The hot path processes thousands of events/second. An AI call takes 2-30 seconds. Awaiting would stall every subsequent event. The `void` keyword makes the intent explicit — we don't care about the return value here.

## Three Guard Layers

### Guard 1: Memory Dedup (Cheapest — O(1))

```typescript
const analysisTimestamps = new Map<string, number>();
const COOLDOWN_MS = 172_800_000; // 48 hours

function hasRecentAnalysis(entityId: string): boolean {
  const lastAnalysis = analysisTimestamps.get(entityId);
  return lastAnalysis !== undefined && Date.now() - lastAnalysis < COOLDOWN_MS;
}
```

Check memory first — it's the cheapest guard. If we analyzed this entity recently, skip immediately.

### Guard 2: Database Dedup (Authoritative — catches restarts)

```typescript
async function hasPendingRecommendation(entityId: string): Promise<boolean> {
  const existing = await prisma.recommendation.findFirst({
    where: {
      entityId,
      status: { in: ['draft', 'needs_review'] },
      createdAt: { gte: new Date(Date.now() - COOLDOWN_MS) },
    },
  });
  return existing !== null;
}
```

Memory dedup is lost on restart. The DB check catches the case where a recommendation was created in a previous process lifetime.

### Guard 3: Process Change Detection (Domain-specific — prevents false positives)

```typescript
async function hasSignificantProcessChange(
  tagId: string,
  windowSec: number,
): Promise<boolean> {
  const points = await fetchRecentHistory(tagId, windowSec);
  const { stdDev } = computeStats(points.map((p) => p.value));
  const lastN = points.slice(-10).map((p) => p.value);
  const range = Math.max(...lastN) - Math.min(...lastN);

  // Range of last 10 readings exceeds 3x the overall standard deviation
  // → real process event, not noise
  return range > 3.0 * stdDev;
}
```

Prevents the AI from recommending changes when the entity is actually responding to a real process event (not just noise).

## Guard Execution Order

```
recordAdvisorTransition()
  → Threshold check (count < N → return)        [O(1), sync]
  → Memory dedup (analyzed recently → return)    [O(1), sync]
  → DB dedup (pending recommendation → return)   [O(1), async]
  → Process change check (real event → return)   [O(N), async]
  → AI call (expensive → execute)                [O($), async]
  → Write recommendation to DB
  → Emit event for real-time UI push
```

Guards are ordered cheapest-first. Each layer eliminates candidates before the expensive step.

## AI Call Pattern

```typescript
async function runAnalysis(entityId: string, context: EntityContext): Promise<void> {
  // Guard 1: Memory dedup
  if (hasRecentAnalysis(entityId)) return;

  // Guard 2: DB dedup
  if (await hasPendingRecommendation(entityId)) return;

  // Guard 3: Process change
  if (await hasSignificantProcessChange(context.tagId, 300)) return;

  // Fetch historical data for AI context
  const history = await fetchHistory(entityId, HISTORY_POINTS);
  const stats = computeStats(history);

  // Call AI with structured prompt + budget cap
  const result = await callAI({
    model: 'sonnet',
    maxBudget: 0.10,
    timeout: 60_000,
    prompt: formatAnalysisPrompt(context, history, stats),
  });

  // Parse structured response (return null on failure — safe no-op)
  const recommendation = parseResponse(result);
  if (!recommendation) return;

  // Write to database
  const record = await createRecommendation(entityId, context, recommendation);

  // Update memory dedup
  analysisTimestamps.set(entityId, Date.now());

  // Push to real-time subscribers
  advisorEvents.emit('recommendation', {
    entityId,
    ...recommendation,
    recordId: record.id,
    timestamp: new Date().toISOString(),
  });
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Pattern |
|-------------|---------------|-----------------|
| `await runAnalysis()` in hot path | Stalls all subsequent events | `void runAnalysis().catch(log)` |
| Only memory dedup | Lost on restart → duplicate recommendations | Memory + DB dedup |
| Only DB dedup | Extra DB query for every event | Memory first (cheap), DB second |
| No process change check | Recommends changes during real upsets | Check if entity is responding to real signal |
| No budget cap on AI call | Runaway costs on noisy systems | Set `maxBudget` and `timeout` |
| Retrying failed AI calls | Amplifies cost during outages | Fail silently, next threshold crossing retries naturally |

## Domains Where This Applies

| Domain | Hot Path | AI Advisory |
|--------|---------|-------------|
| SCADA/Industrial | Alarm engine evaluating tag changes | Deadband tuning, alarm rationalization |
| Trading | Order matching engine | Risk scoring, anomaly flagging |
| IoT | Sensor data ingestion | Predictive maintenance recommendations |
| Healthcare | Vitals monitoring | Clinical decision support |
| Manufacturing | Quality inspection pipeline | Defect classification, SPC recommendations |
