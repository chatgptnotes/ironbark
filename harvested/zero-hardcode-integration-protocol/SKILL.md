---
name: Zero-Hardcode Bottom-Up Integration Protocol
description: 5-step mandatory build order for any data-display feature — Backend → Verify → Store → UI → Traceability. Prevents AI from hallucinating a "finished" UI with hardcoded demo data by forcing verification of the real data path before any frontend work begins.
type: pattern
tags: [scada, dashboard, react, zustand, prisma, anti-hardcoding, integration, workflow, data-driven]
---

# Zero-Hardcode Bottom-Up Integration Protocol

## Problem

When asked to build a feature (dashboard widget, data table, live chart, HMI panel), AI coding assistants default to the **"Agentic Shortcut"**: they build the complete UI immediately with hardcoded demo data because it's faster and looks finished. The result:

- `useState([{ id: 1, name: "Demo Pump", value: 72.4 }])` — fake data that never gets replaced
- Connected status shown even when API is down
- Beautiful UI that breaks immediately in production
- Hours of debugging to find where real data was supposed to come from

## Solution — The 5-Step Bottom-Up Protocol

Force this exact order. **Never skip. Never reorder.**

---

## The 5 Steps

### Step 1 — Backend + Schema First

Build only the data layer. Nothing else.

```
- Create the database model / Prisma schema
- Create the service/repository function
- Create the API endpoint (if needed)
- For real-time: create the polling/subscription service

DO NOT: touch React, Zustand, Redux, or any UI file
OUTPUT: schema + service code only
```

### Step 2 — Verify the Data Path (mandatory gate)

Run a test or curl that proves real data flows. **You must see real data before proceeding.**

```bash
# Option A — direct service test
npx vitest run src/services/tags.test.ts

# Option B — curl the endpoint
curl http://localhost:3000/api/tags/1

# Option C — Python script
python3 -c "from services.contacts import get_all; print(get_all())"
```

**Gate rule:** If the output shows real data → proceed to Step 3.  
If it fails → fix the backend. Do NOT move forward with a broken pipe.

### Step 3 — Frontend Store (Zustand / Redux / Context)

Wire the store to the verified endpoint. **Required fields:**

```typescript
interface TagStore {
  data: Tag | null;        // real data or null — never fake default
  loading: boolean;        // true while fetching
  error: string | null;    // error message or null
  fetch: (id: string) => Promise<void>;
}

const useTagStore = create<TagStore>((set) => ({
  data: null,              // NOT: { id: 1, value: 72.4 }
  loading: false,
  error: null,
  fetch: async (id) => {
    set({ loading: true, error: null });
    try {
      const data = await api.get(`/tags/${id}`);
      set({ data, loading: false });
    } catch (e) {
      set({ error: e.message, loading: false, data: null });
    }
  },
}));
```

### Step 4 — UI Components

Build the display layer. **Hardcoding is forbidden.**

```tsx
// ✅ CORRECT — real states
function TagDisplay({ id }: { id: string }) {
  const { data, loading, error } = useTagStore();

  if (loading) return <Spinner />;
  if (error)   return <ErrorState message={error} />;
  if (!data)   return <span>No Data</span>;          // NOT a hardcoded value

  return <span>{data.value} {data.unit}</span>;
}

// ❌ FORBIDDEN — fake data
function TagDisplay() {
  const [value] = useState(72.4);   // hardcoded
  return <span>{value} bar</span>;  // looks fine, never wired
}
```

**Required states every data component must handle:**
- `loading` — show spinner or skeleton
- `error` — show error message, not fake data
- `empty/null` — show "No Data" or "Disconnected"
- `live` — show real value

### Step 5 — Traceability Comments

Every component that displays data gets one traceability line:

```tsx
// DATA SOURCE: GET /api/tags/:id → tag_readings.value → useTagStore().data.value
function PressureGauge({ tagId }) { ... }

// DATA SOURCE: Supabase bni_contacts.status → useContactStore().contacts[].status
function ContactStatusBadge({ contactId }) { ... }
```

---

## The Protocol as a Prompt

Paste this when starting any data-display feature:

```
I want to implement [Feature Name]. Follow the Zero-Hardcode Protocol:

Step 1: Backend + Schema only. No UI yet.
Step 2: Write a verification command (test/curl/script) I can run to see real data.
        WAIT for me to confirm real data before proceeding.
Step 3: Zustand/store with data/loading/error states. No hardcoded defaults.
Step 4: UI components. No hardcoding. Missing data = "No Data" state.
Step 5: Add // DATA SOURCE comments to every data-bound component.

Start with Step 1 only.
```

---

## Why It Works

| Without Protocol | With Protocol |
|-----------------|---------------|
| Broken pipeline found after 10 components built | Broken pipeline found in Step 2 (before any UI) |
| Hardcoded data that "works in demo" | Real data or honest empty state |
| No idea where data comes from | Every component has a DATA SOURCE comment |
| 3 hours of debugging | 20 minutes of fixing at the right layer |

---

## Example Domains

| Feature | Step 1 artifact | Step 2 verification |
|---------|----------------|---------------------|
| SCADA live tag display | Prisma TagReading model + polling service | `curl /api/tags/PLC1_PRESSURE` → real value |
| BNI contact status table | Supabase query function | `python3 -c "print(get_contacts())"` |
| WhatsApp message history | DB query + REST endpoint | `curl /api/messages?phone=+91...` |
| Dashboard metric card | Aggregation query + service | `npx vitest run metrics.test.ts` |
| Real-time chart | WebSocket tag subscription | Console log showing live values |
