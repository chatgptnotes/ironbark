---
name: Industrial Rollback Policy Pattern
description: PLC batch write rollback with persistence, exponential retry, timeout, and real-time operator notifications via Socket.IO
source_project: nexaproc
projects_used_in: [nexaproc]
tags: [typescript, scada, industrial, plc, rollback, socket.io, postgresql]
---

# Industrial Rollback Policy Pattern

## Problem
In SCADA/industrial systems, batch PLC writes can partially fail. You need a rollback mechanism that:
1. Persists rollback plans (survives server restarts)
2. Retries with backoff (PLCs may be temporarily unresponsive)
3. Times out gracefully (don't block indefinitely)
4. Notifies operators in real-time (they need to know immediately)

## Architecture

```
batchWrite() → createRollbackPlan() → persist to DB
     ↓                                      ↑
  execute writes ────── on failure ──► executeRollback()
                                           ↓
                                    retry with backoff (3x)
                                           ↓
                                    emit events → Socket.IO → UI
```

## Database Schema (Prisma + raw SQL migration)
```sql
CREATE TABLE rollback_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL,
  tag_id UUID NOT NULL,
  previous_value TEXT NOT NULL,
  target_value TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | success | failed | timeout
  attempts INT NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX idx_rollback_batch ON rollback_log(batch_id);
```

## Rollback Manager Pattern
```typescript
class RollbackManager {
  private readonly MAX_RETRIES = 3;
  private readonly BASE_DELAY_MS = 1000;
  private readonly TIMEOUT_MS = 30000;

  async createRollbackPlan(batchId: string, writes: TagWrite[]): Promise<void> {
    // Read current values BEFORE writing
    const currentValues = await this.readCurrentValues(writes);
    // Persist plan to DB
    await prisma.rollbackLog.createMany({
      data: currentValues.map(v => ({
        batchId,
        tagId: v.tagId,
        previousValue: String(v.currentValue),
        targetValue: String(v.newValue),
        status: 'pending',
      })),
    });
  }

  async executeRollback(batchId: string): Promise<RollbackResult> {
    const entries = await prisma.rollbackLog.findMany({
      where: { batchId, status: 'pending' },
    });

    this.emit('rollback:started', { batchId, count: entries.length });

    const timeout = setTimeout(() => this.timeoutRemaining(batchId), this.TIMEOUT_MS);

    for (const entry of entries) {
      let success = false;
      for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
        try {
          await this.writeTag(entry.tagId, entry.previousValue);
          await this.markSuccess(entry.id, attempt);
          success = true;
          this.emit('rollback:progress', { batchId, tagId: entry.tagId, status: 'success' });
          break;
        } catch (err) {
          const delay = this.BASE_DELAY_MS * Math.pow(2, attempt - 1);
          await sleep(delay);
        }
      }
      if (!success) {
        await this.markFailed(entry.id, this.MAX_RETRIES);
        this.emit('rollback:progress', { batchId, tagId: entry.tagId, status: 'failed' });
      }
    }

    clearTimeout(timeout);
    this.emit('rollback:completed', { batchId });
  }
}
```

## Real-Time Notifications
```typescript
// Backend: forward rollback events to Socket.IO
rollbackManager.on('rollback:started', (data) => {
  io.emit('rollback:started', data);
});

// Frontend: RollbackAlert component
// - Amber during rollback (in-progress)
// - Green on success (auto-dismiss after 5s)
// - Red on failure (persistent, requires manual acknowledgment)
```

## When This Applies
- Any system writing to PLCs/devices in batches
- Industrial control systems requiring safe state recovery
- SCADA batch command execution
- Any write-heavy system needing atomic-like rollback guarantees
