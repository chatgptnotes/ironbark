---
name: No Mock Data in Production SCADA/Multi-Modal Apps
description: Eliminate hardcoded mock arrays in CRUD pages and backend demo-data fallbacks — every feature must use real API calls with database persistence from day one. Covers both frontend useState mocks AND backend Math.random()/demo-service fallbacks.
source_project: nexaproc
projects_used_in: [nexaproc, ampris-1]
tags: [typescript, react, scada, api, architecture, anti-pattern, crud, express, backend]
---

# No Mock Data in Production Multi-Modal Applications

## Problem

In large SCADA/industrial applications with 30+ pages, developers often scaffold pages with hardcoded `useState([{...mock data}])` to quickly show UI. Over time these "temporary" mocks become permanent — users configure alarms, tags, equipment, and everything is silently lost on page refresh because nothing calls the backend API.

This is especially dangerous in SCADA systems where configuration data (alarm thresholds, tag mappings, equipment hierarchies) directly affects plant safety.

## Anti-Patterns Found

```typescript
// ANTI-PATTERN 1: Hardcoded arrays as initial state
const MOCK_DEVICES = [
  { id: 'dev-001', name: 'PLC-01', protocol: 'MODBUS_TCP' },
  { id: 'dev-002', name: 'RTU-01', protocol: 'MODBUS_RTU' },
];
const [devices, setDevices] = useState(MOCK_DEVICES);

// ANTI-PATTERN 2: CRUD that only updates local state
const saveDevice = () => {
  setDevices(prev => [...prev, newDevice]);  // LOST ON REFRESH!
  setModalOpen(false);
};

// ANTI-PATTERN 3: Fake ID generation
const deleteDevice = (id: string) => {
  setDevices(prev => prev.filter(d => d.id !== id));  // NEVER CALLS API!
};

// ANTI-PATTERN 4: plantId mapping hacks
const activePlantId = activeProject.id.replace('proj-', 'plant-');
```

## Correct Pattern

```typescript
// 1. State starts empty, loaded from API
const [devices, setDevices] = useState<Device[]>([]);
const [loading, setLoading] = useState(false);

// 2. Fetch from API on mount (scoped to active project)
const fetchDevices = () => {
  if (!activeProject?.id) return;
  setLoading(true);
  api.get('/devices', { params: { projectId: activeProject.id } })
    .then(res => setDevices(res.data))
    .catch(() => setDevices([]))
    .finally(() => setLoading(false));
};
useEffect(() => { fetchDevices(); }, [activeProject?.id]);

// 3. Create via API, then refresh
const saveDevice = async () => {
  try {
    if (editing) {
      await api.put(`/devices/${editing.id}`, payload);
    } else {
      await api.post('/devices', payload);
    }
    setModalOpen(false);
    fetchDevices();  // Refresh from source of truth
  } catch (err) {
    toast.error(err.response?.data?.error ?? 'Failed to save');
  }
};

// 4. Delete via API, then refresh
const deleteDevice = async (id: string) => {
  if (!confirm('Delete this device?')) return;
  await api.delete(`/devices/${id}`);
  fetchDevices();
};
```

## Checklist for Every CRUD Page

- [ ] `useState` initialized with `[]` or `null`, NOT mock arrays
- [ ] `useEffect` fetches from API on mount with `projectId` filter
- [ ] Create calls `api.post()` then refreshes
- [ ] Update calls `api.put()` then refreshes
- [ ] Delete calls `api.delete()` then refreshes
- [ ] Loading state shown while fetching
- [ ] Error handling with user-visible messages
- [ ] Data persists after page refresh (verify manually!)
- [ ] No hardcoded IDs (plant-001, dev-001, TT-101)
- [ ] Project scoping via `activeProject.id` from store, not string manipulation

## When This Applies

- Any multi-page application with CRUD features
- SCADA/HMI configuration pages (tags, alarms, equipment, devices)
- Multi-tenant SaaS with entity management
- Any page where users expect their changes to persist

## Backend Anti-Patterns (API Routes)

```typescript
// ANTI-PATTERN 5: Demo data service as fallback
import { generateEquipmentHealth } from '../services/ai-demo-data.service';
export async function getEquipmentHealth(req, res) {
  if (!isInitialized()) { res.json(generateEquipmentHealth()); return; } // FAKE DATA!
}

// ANTI-PATTERN 6: Math.random() in analytics responses
res.json({
  powerFactor: +(0.92 + Math.random() * 0.05).toFixed(2),  // FAKE!
  efficiency: +(93 + Math.random() * 4).toFixed(1),          // FAKE!
});

// ANTI-PATTERN 7: Silent fallback to demo in catch blocks
catch {
  setData(generateDemoData(timeRange));  // Shows fake charts silently!
}
```

### Correct Backend Pattern

```typescript
// Return 503 when service not ready — never fake data
if (!isInitialized()) {
  res.status(503).json({ error: 'ML models initializing — no data available yet' });
  return;
}

// Return null for missing metrics — let frontend show "N/A"
res.json({
  load: Math.round(avg(b.load)),
  powerFactor: null,  // No sensor data yet
  efficiency: null,
});

// Return 501 for unimplemented integrations
res.status(501).json({ error: 'Requires integration with inventory system' });
```

### Correct Frontend Pattern

```typescript
// Show empty state, not fake charts
catch {
  setData([]);  // Empty = honest
}

// Display "N/A" for null values
<span>{datum.powerFactor ?? 'N/A'}</span>
```

## Red Flags to Watch For

### Frontend
1. `const MOCK_` or `const initial` followed by `[{` — hardcoded arrays
2. `useState(MOCK_` or `useState(initial` — state from mock data
3. `setXxx(prev => [...prev, item])` without any `api.post()` call
4. No `import api from '@/services/api'` in a page with add/edit/delete buttons
5. IDs like `TAG-${++counter}` instead of UUIDs from the database

### Backend
6. `import { generate* } from '../services/*-demo-data*'` — demo data service imports
7. `Math.random()` in any controller or service returning API responses
8. `res.json([{...hardcoded objects...}])` without any Prisma/DB call
9. Catch blocks that silently return fake data instead of error status codes
10. Files named `*-demo*`, `*-mock*`, `*-sample*` in services directory
