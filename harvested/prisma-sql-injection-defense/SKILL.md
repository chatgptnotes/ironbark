---
name: Prisma SQL Injection Defense
description: Safe patterns for dynamic SQL with Prisma $queryRawUnsafe — allowlist maps instead of string interpolation for identifiers
source_project: nexaproc
projects_used_in: [nexaproc]
tags: [typescript, prisma, security, sql-injection, postgresql, timescaledb]
---

# Prisma SQL Injection Defense

## Problem
When using TimescaleDB features (time_bucket, continuous aggregates, hypertable views), you often need dynamic SQL identifiers (table names, interval strings, aggregate expressions) that can't be parameterized with `$1` placeholders. `$queryRawUnsafe` with string interpolation creates SQL injection vectors.

## Anti-Pattern (Dangerous)
```typescript
// User-controlled 'interval' flows into SQL string
const rows = await prisma.$queryRawUnsafe(`
  SELECT time_bucket('${interval}'::interval, bucket) AS bucket,
         ${aggExpr} AS value
  FROM ${viewName}
  WHERE "tagId" = $1::uuid
`, tagId);
```

## Safe Pattern: Hardcoded Allowlist Maps
```typescript
// Map validated enum → hardcoded SQL fragment (no user string ever reaches SQL)
const INTERVAL_MAP: Record<string, string> = {
  '1m': '1 minute',
  '5m': '5 minutes',
  '1h': '1 hour',
  '1d': '1 day',
};

const AGG_EXPR_MAP: Record<string, string> = {
  avg: 'AVG(avg_value)',
  min: 'MIN(min_value)',
  max: 'MAX(max_value)',
  sum: 'SUM(avg_value * sample_count)',
};

const VIEW_MAP: Record<string, string> = {
  '1m': 'tag_history_1min',
  '1h': 'tag_history_1hr',
  '1d': 'tag_history_1day',
};

// Usage — lookup returns hardcoded string or undefined
const pgInterval = INTERVAL_MAP[userInterval];
const aggExpr = AGG_EXPR_MAP[userAgg];
const view = VIEW_MAP[userResolution];

if (!pgInterval || !aggExpr || !view) {
  throw new Error('Invalid query parameters');
}

// Safe: only hardcoded strings are interpolated
const rows = await prisma.$queryRawUnsafe(`
  SELECT time_bucket('${pgInterval}'::interval, bucket) AS bucket,
         ${aggExpr} AS value
  FROM ${view}
  WHERE "tagId" = $1::uuid AND bucket >= $2 AND bucket <= $3
  ORDER BY bucket LIMIT $4
`, tagId, startDate, endDate, limit);
```

## Key Principles
1. **Never interpolate user input** — even if "validated" by a switch/if upstream
2. **Allowlist maps are defense-in-depth** — the map output is a hardcoded string literal, not user data
3. **Use $queryRaw (tagged template)** when possible — only fall back to $queryRawUnsafe for dynamic identifiers
4. **Fail closed** — if the lookup returns undefined, reject the request; don't fall through to a default

## When This Applies
- TimescaleDB time_bucket queries with variable intervals
- Dynamic aggregate expressions (AVG/MIN/MAX/SUM)
- Continuous aggregate view selection
- Any Prisma query needing dynamic SQL identifiers (table names, column names)
