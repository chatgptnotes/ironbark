---
name: Zero Mock, Zero Fallback — Honest Data or Honest Error
description: Enforce strict no-mock, no-fallback policy across frontend and backend. API failure shows error, empty data shows blank — never fake data, never hardcoded endpoints, never silent fallback to demo.
source_project: nexaproc
projects_used_in: [nexaproc, ampris-1]
tags: [typescript, react, express, api, architecture, anti-pattern, scada, crud, testing, code-review]
---

# Zero Mock, Zero Fallback — Honest Data or Honest Error

## The Rule

**If real data exists → show it. If no data exists → show blank/empty. If API fails → show error. NEVER show fake data.**

No exceptions. No "demo mode fallback". No "keep mock data on error". No hardcoded endpoints that return fake results.

## Why This Matters

In SCADA/industrial systems, showing fake data is DANGEROUS:
- Operator sees "pump running" (mock) while pump is actually stopped → no corrective action
- Dashboard shows "0 alarms" (mock) while 5 critical alarms are active → safety incident
- Tag value shows "85°C" (mock) while real temperature is 120°C → equipment damage

Even in non-SCADA apps, fake data wastes user time and destroys trust.

---

## Frontend Rules

### Rule 1: useState always starts with [] or null
```typescript
// ❌ BANNED
const [items, setItems] = useState(MOCK_ITEMS);
const [items, setItems] = useState(initialItems);

// ✅ REQUIRED
const [items, setItems] = useState<Item[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
```

### Rule 2: API failure shows error, NOT mock data
```typescript
// ❌ BANNED — silent fallback to mock
try {
  const res = await api.get('/items');
  setItems(res.data);
} catch {
  setItems(MOCK_ITEMS); // FAKE DATA!
  // or: setItems(generateDemoData()); // FAKE DATA!
  // or: console.warn('Using demo mode'); // SILENT LIE!
}

// ✅ REQUIRED — honest error
try {
  const res = await api.get('/items');
  setItems(res.data?.data ?? []);
} catch (err) {
  setError(err instanceof Error ? err.message : 'Failed to load data');
  setItems([]); // Empty, not fake
}
```

### Rule 3: Empty state shows blank table, NOT "no results found" with fake suggestion
```typescript
// ❌ BANNED
if (items.length === 0) return <div>Try adding your first item!</div>; // misleading if API failed

// ✅ REQUIRED
if (error) return <ErrorBanner message={error} onRetry={fetchItems} />;
if (loading) return <LoadingSpinner />;
if (items.length === 0) return <EmptyTable columns={columns} />; // blank table with headers
```

### Rule 4: No hardcoded API URLs as fallback
```typescript
// ❌ BANNED
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
// This silently breaks in production when env var isn't set

// ✅ REQUIRED
const isProduction = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
const API_URL = import.meta.env.VITE_API_URL
  || (isProduction ? 'https://api.yourdomain.com/api' : 'http://localhost:3001/api');
// Production always uses production URL, never localhost
```

### Rule 5: No mock login fallback
```typescript
// ❌ BANNED
login: async (email, password) => {
  try { /* real login */ }
  catch {
    // Fall back to mock login
    const result = mockLogin(email, password);
    set({ user: result.user, token: 'demo-token-123' });
  }
}

// ✅ REQUIRED
login: async (email, password) => {
  try { /* real login */ }
  catch (err) {
    throw new Error('Server unavailable. Please try again later.');
  }
}
```

---

## Backend Rules

### Rule 6: No Math.random() in API responses
```typescript
// ❌ BANNED
res.json({
  powerFactor: +(0.92 + Math.random() * 0.05).toFixed(2),
  efficiency: +(93 + Math.random() * 4).toFixed(1),
});

// ✅ REQUIRED
res.json({
  powerFactor: dbRow.powerFactor ?? null,  // null if no data
  efficiency: dbRow.efficiency ?? null,
});
```

### Rule 7: No demo-data services
```typescript
// ❌ BANNED
import { generateEquipmentHealth } from '../services/ai-demo-data.service';
if (!isInitialized()) { res.json(generateEquipmentHealth()); return; }

// ✅ REQUIRED
if (!isInitialized()) {
  res.status(503).json({ error: 'Service initializing — no data available yet' });
  return;
}
```

### Rule 8: Return 503 for unavailable services, not fake data
```typescript
// ❌ BANNED
catch { res.json([]); } // Silent empty response hides errors

// ✅ REQUIRED
catch (err) {
  logger.error('Query failed:', err);
  res.status(500).json({ error: 'Database query failed' });
}
```

---

## Audit Commands

### Find all mock data in frontend
```bash
# Hardcoded arrays
grep -rn 'const MOCK_\|const initial[A-Z].*\[' src/pages/ src/components/

# Mock imports
grep -rn "from '@/mocks\|from '../mocks" src/

# Demo fallbacks
grep -rn 'demo-token\|mockLogin\|DEMO_MODE.*true\|generateDemo\|generateMock' src/

# Hardcoded localhost in production code
grep -rn "localhost:3001\|localhost:5432\|127.0.0.1" src/ --include='*.ts' --include='*.tsx' | grep -v 'node_modules\|test'
```

### Find all fake data in backend
```bash
# Math.random in responses
grep -rn 'Math.random()' server/src/controllers/ server/src/routes/

# Demo data services
find server/src -name '*demo*' -o -name '*mock*' -o -name '*sample*'

# Silent catch blocks returning fake data
grep -rn 'catch.*{' server/src/controllers/ | grep -v 'logger\|throw\|status(5'
```

---

## Display Rules

| Scenario | What to show |
|----------|-------------|
| Loading | Skeleton / spinner |
| API returns data | Real data in table/chart |
| API returns empty array | Blank table with column headers, "No data" row |
| API returns error | Red error banner with message + retry button |
| API unreachable | "Server unavailable" with retry button |
| Feature not implemented | "Coming soon" (NOT fake data) |
| Value is null from DB | "N/A" or "—" (NOT 0, NOT random) |

---

## Pre-Commit Checklist

Before marking ANY page/feature complete:
- [ ] No `MOCK_*` or `initial*` arrays in useState
- [ ] No `@/mocks` imports
- [ ] No `demo-token` or `mockLogin` in auth
- [ ] No `Math.random()` in any controller response
- [ ] No catch blocks that silently return fake data
- [ ] API failure shows visible error to user
- [ ] Empty data shows blank table, not "helpful" fake entries
- [ ] Page data persists after refresh (stored in DB, not just React state)
- [ ] Hardcoded localhost has production fallback
- [ ] No `generateDemo*` or `generateMock*` functions called in production code paths

---

## When This Applies

- Every page in every web application
- Every API endpoint in every backend
- Every SCADA/industrial control system (SAFETY CRITICAL)
- Every SaaS dashboard
- Every data visualization

**There is NO valid use case for showing fake data to a user who expects real data.**

Demo/showcase modes should be explicitly labeled and isolated, never mixed into production code paths.
