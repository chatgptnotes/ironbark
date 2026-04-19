---
name: Supabase Polling Overload — Diagnosis and Fix
description: When Supabase shows millions of DB requests from a React app, the cause is almost always cascading React Query refetchIntervals and unguarded staleTime. Diagnose by grepping for refetchInterval, fix by raising intervals and adding staleTime.
source_project: adamrit
projects_used_in: [adamrit]
tags: [supabase, react-query, polling, performance, tanstack-query, realtime, database, cost]
---

# Supabase Polling Overload — Diagnosis and Fix

## The Symptom

Supabase dashboard shows millions of **database requests** in 24-30 hours. The split is almost entirely database requests (99%+), not API or storage. Cost and rate limits are at risk.

Real example: **10,924,194 database requests in 30 hours** (~101 req/sec sustained) on a hospital management app.

## Root Causes (in order of severity)

### 1. React Query `refetchInterval` too aggressive
Every open browser tab or mounted component runs the interval independently. Multiple users × multiple pages × short intervals = exponential load.

```ts
// WRONG — runs every 5 seconds per tab
useQuery({
  queryKey: ['sync-status'],
  queryFn: () => supabase.from('tally_sync_status').select('*'),
  refetchInterval: 5000,  // ← culprit
})

// CORRECT — 60 seconds minimum for status polling
useQuery({
  queryKey: ['sync-status'],
  queryFn: () => supabase.from('tally_sync_status').select('*'),
  refetchInterval: 60000,
})
```

**Rule of thumb:** Status/queue polling → 60s minimum. Approvals dashboard → 120s minimum.

### 2. Multiple independent polling queries on one page
A single page with 4 queries at 15-30s each = 8-16 req/min per user on that page.

```ts
// BillApprovals pattern — 4 queries each running independently
refetchInterval: 15000,  // pending bills
refetchInterval: 30000,  // approved bills
refetchInterval: 15000,  // pending discounts
refetchInterval: 15000,  // pending packages
// Total: ~8 req/min per user × concurrent users
```

Fix: Raise all to 120000 (2 minutes). Approval queues don't need sub-minute freshness.

### 3. Missing `staleTime` on app-root count queries
Count queries mounted at app root (sidebar badges, navigation counts) re-run on every route change without `staleTime`.

```ts
// 18 count queries running on every route navigation
useQuery({
  queryKey: ['diagnoses-count'],
  queryFn: () => supabase.from('diagnoses').select('count'),
  refetchOnWindowFocus: false,
  // missing staleTime → refetches on every route mount
})

// CORRECT
useQuery({
  queryKey: ['diagnoses-count'],
  queryFn: () => supabase.from('diagnoses').select('count'),
  refetchOnWindowFocus: false,
  staleTime: 5 * 60 * 1000,  // ← holds for 5 min
})
```

### 4. Realtime subscription calling full refetch on every change
```ts
// WRONG — refetches all data on every single INSERT/UPDATE/DELETE
supabase.channel('corporate-changes')
  .on('postgres_changes', { event: '*', table: 'corporate' }, () => {
    fetchCorporateData()  // ← called for every row in a bulk import
  })
  .subscribe()

// CORRECT — debounce to absorb bulk operation storms
const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

supabase.channel('corporate-changes')
  .on('postgres_changes', { event: '*', table: 'corporate' }, () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchCorporateData(), 2000)
  })
  .subscribe()
```

## Diagnosis Checklist

1. **Check Supabase dashboard** — request type split (database vs API vs storage)
2. **Grep for `refetchInterval`** across the codebase:
   ```bash
   grep -rn "refetchInterval" src/ | sort -t: -k3 -n
   ```
3. **Grep for `setInterval`** in React components:
   ```bash
   grep -rn "setInterval" src/
   ```
4. **Check root-level hooks** (mounted in App.tsx or layout) for missing `staleTime`
5. **Grep for realtime subscriptions** that call full fetches:
   ```bash
   grep -rn "postgres_changes" src/ -A5 | grep -A3 "fetchData\|refetch\|load"
   ```
6. **SSH to VPS** and check for server-side loops:
   ```bash
   ps aux | grep -i <service>; crontab -l; pm2 list
   ```

## Fix Matrix

| Pattern | Fix | Expected Reduction |
|---|---|---|
| `refetchInterval: 5000` on status hook | → `60000` | 12× |
| `refetchInterval: 15000` on approval queries | → `120000` | 8× |
| Root-level count queries without staleTime | Add `staleTime: 5 * 60 * 1000` | 5-10× |
| Realtime callback calling full refetch | Debounce 2000ms | Stops cascade |

## Math to Estimate Severity

```
Requests per hour = (60 / interval_seconds) × queries_per_page × concurrent_users × pages_open

Example:
5s interval × 1 query × 5 users × 3 tabs = 180 req/min = 10,800 req/hr = 259,200 req/day
```

## Example Domains

| Domain | Typical Polling Pages | Common Offender |
|---|---|---|
| Hospital management | Bill approvals, OPD queue, pharmacy | Approval status polling at 15s |
| E-commerce admin | Order queue, inventory alerts | Live order count at 5s |
| CRM | Contact sync status, email queue | Sync status polling at 5s |
| SCADA | Tag values, alarm list | Realtime subscription refetch |

## What NOT to Suspect First

- Supabase Edge Functions (would show as API requests, not DB)
- VPS cron jobs (check last — browser is almost always the cause)
- Realtime channel count alone (subscriptions themselves are cheap; it's the callbacks that fetch)

## After Fixing

Deploy and watch Supabase dashboard. Request rate should drop within minutes of the next browser refresh. From 101 req/sec expect drop to under 5 req/sec after fixing intervals and staleTime.
