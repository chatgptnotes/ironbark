---
name: Worker Read-Only DB Role Pattern
description: Background workers (BullMQ, cron, etc.) should read operational data via a dedicated SELECT-only Postgres role with its own DATABASE_URL — not via in-process EventEmitters or public WebSocket endpoints.
source_project: nexaproc
projects_used_in: [nexaproc]
tags: [security, postgres, bullmq, workers, iec-62443, scada, least-privilege, multi-process]
harvested: 2026-04-11
---

# Worker Read-Only DB Role Pattern

When a background worker in a separate process needs to read operational data (tag history, alarm log, audit events), three obvious paths exist — only one of them is actually safe and clean.

## When to Use

- Any BullMQ / Bee-Queue / cron worker that runs as a separate PM2 process (or its own container) from the API
- When the worker needs historical/timeseries data, not realtime events
- When the platform is multi-tenant or has segmentation requirements (IEC 62443, PCI, HIPAA)
- When an in-process EventEmitter looks tempting but the worker is in another process

## The three candidate paths

| # | Path | Attack surface | Multi-process safe | Latency | Verdict |
|---|------|---|---|---|---|
| A | Subscribe via public Socket.IO / WebSocket | **Widens** — worker needs a long-lived JWT routed through the public edge | ✓ | 20–50 ms + auth | **Rejected** — external channel for internal consumer is an IEC 62443 smell |
| B | Read in-process EventEmitter (e.g. `tagEngine.on('change', …)`) | None, but forces worker into the API process | ✗ (EventEmitters can't cross process boundaries) | <1 ms | **Rejected** — undoes the worker separation, bigger blast radius of worker bugs |
| C | Query the existing persistence layer via a dedicated read-only DB role | **Smallest** — DB is already a trust zone, existing services use it | ✓ | 50–150 ms | **Selected** |

Option C wins on every axis except raw latency, and for jobs that run every 1–5 minutes the 100 ms is irrelevant.

## Implementation

### 1. Create the dedicated Postgres role (one-off, during migration window)

```sql
-- Connect as superuser
CREATE ROLE nexaproc_ai_reader WITH LOGIN PASSWORD '<strong-random>' NOINHERIT;

-- Grant SELECT only on the specific tables the worker needs
GRANT CONNECT ON DATABASE nexaproc TO nexaproc_ai_reader;
GRANT USAGE ON SCHEMA public TO nexaproc_ai_reader;
GRANT SELECT ON tag_history, tag TO nexaproc_ai_reader;

-- Explicitly REVOKE everything else to catch future table additions
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM nexaproc_ai_reader;

-- Verify
\du nexaproc_ai_reader
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'nexaproc_ai_reader';
```

### 2. Dedicated env var — never reuse the main connection string

```dotenv
# .env
DATABASE_URL=postgresql://nexaproc:***@localhost:5432/nexaproc
DATABASE_URL_AI_READER=postgresql://nexaproc_ai_reader:***@localhost:5432/nexaproc
```

`DATABASE_URL` is the Prisma migration role (write + DDL). `DATABASE_URL_AI_READER` has SELECT only. A compromised worker cannot write, cannot DDL, cannot touch users or audit tables.

### 3. Dedicated Prisma / pg client in the worker

```ts
// server/src/workers/db.ts
import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL_AI_READER) {
  throw new Error('DATABASE_URL_AI_READER is required for worker processes');
}

export const readerDb = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL_AI_READER },
  },
  log: ['warn', 'error'],
});
```

**Never** import the main `prisma` client from `server/src/config/database.ts` into the worker. Add an ESLint rule if necessary.

### 4. Worker queries the hypertable

```ts
// server/src/workers/pdm-22-worker.ts
import { readerDb } from './db';
import { isolationForest } from '../lib/ai/anomaly';

export async function evaluateHvac(assetId: string) {
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000);  // last 6 hours

  const rows = await readerDb.tagHistory.findMany({
    where: { tag: { equipmentId: assetId }, timestamp: { gte: since } },
    select: { timestamp: true, value: true, tagId: true },
    orderBy: { timestamp: 'asc' },
  });

  if (rows.length < 60) return { insufficientData: true };

  const matrix = buildFeatureMatrix(rows);   // per-tag columns, rows = time
  const result = isolationForest(matrix, { threshold: 0.6 });

  return {
    assetId,
    anomaliesFound: result.anomalies.filter(Boolean).length,
    scores: result.scores,
  };
}
```

### 5. Verify in the worker boot sequence

```ts
// server/src/workers/index.ts
import { readerDb } from './db';

(async () => {
  // Fail fast if the worker was given the wrong role
  try {
    await readerDb.$executeRawUnsafe('SELECT 1 FROM tag_history LIMIT 1');
  } catch (err) {
    console.error('[worker] cannot read tag_history — wrong DATABASE_URL_AI_READER?', err);
    process.exit(1);
  }

  try {
    await readerDb.$executeRawUnsafe('INSERT INTO tag (id, name) VALUES (gen_random_uuid(), \'test\')');
    console.error('[worker] SECURITY: reader role has INSERT privilege — fix role grants');
    process.exit(1);
  } catch {
    // Expected: permission denied
  }
})();
```

Both smoke tests prove the role is correctly scoped *at every boot*.

## Pitfalls

1. **Prisma caches migration metadata under the main role.** The worker's Prisma client should skip migration metadata queries. Use `schemas` scoping or `$queryRaw` for safety.
2. **Connection pooling.** A separate connection pool means more open connections. Tune `connection_limit` in the `DATABASE_URL_AI_READER` query string (e.g. `?connection_limit=5`).
3. **Rotation strategy.** When you rotate the reader password, both the worker and Postgres need the new value simultaneously. Use `ALTER ROLE ... PASSWORD` + PM2 reload, not a big-bang restart.
4. **Don't give the role SELECT on audit tables** (`electronic_signature`, `alarm_log` if sensitive, `user`, `auth_session`). That's the whole point — a compromised worker must not exfiltrate compliance data.
5. **ORM escape hatches.** If using Prisma and the worker suddenly needs to write, resist. Add a second mutating endpoint in the API and have the worker POST to it with its own scoped API key. Never grant the reader role INSERT.

## Related skills

- `supabase-tenant-filtering` — tenant-scoped queries at the application layer
- `multi-tenant-audit-checklist` — proactive audit of tenant isolation
- `pm2-cluster-scada-pitfall` — why PM2 cluster mode breaks in-memory state
