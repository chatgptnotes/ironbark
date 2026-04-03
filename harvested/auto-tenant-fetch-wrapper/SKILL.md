---
name: Auto-Tenant Fetch Wrapper
description: Modify the frontend API fetch wrapper to auto-append tenant_id from session storage so all existing API calls get tenant scoping without per-page changes
source_project: HazPredict-1
projects_used_in: [HazPredict-1]
tags: [react, frontend, multi-tenant, fetch, api-client, sessionStorage]
harvested: 2026-04-04
---

# Auto-Tenant Fetch Wrapper

Pattern for retrofitting tenant isolation into an existing SPA by modifying the shared API client to automatically include the selected tenant ID in every request.

## When to Use

- Adding multi-tenant support to an existing React/Vue/Svelte SPA
- Many pages already call `apiFetch("/api/resources")` without tenant context
- Don't want to modify every page component to pass tenant ID
- Tenant selection is stored in sessionStorage/localStorage

## The Problem

You have 20+ pages calling `apiFetch("/api/resources")`, `apiFetch("/api/events")`, etc. Adding tenant filtering means each page needs to know the selected tenant and append it to every call. That's 50+ call sites to modify.

## The Solution: Intercept at the Fetch Wrapper

```javascript
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export async function apiFetch(path, options = {}) {
  const token = sessionStorage.getItem("token");

  // Auto-append tenant context from session
  let url = `${API_URL}${path}`;
  const tenantId = sessionStorage.getItem("selectedTenantId");
  if (tenantId && !path.includes("tenant_id=")) {
    const separator = path.includes("?") ? "&" : "?";
    url = `${url}${separator}tenant_id=${tenantId}`;
  }

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    if (res.status === 401) {
      sessionStorage.removeItem("token");
      window.location.href = "/login";
      throw new Error("Session expired");
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error: ${res.status}`);
  }
  return res.json();
}
```

## Key Design Decisions

### 1. Query Parameter, Not Header

Using `?tenant_id=xxx` instead of a custom header because:
- Works with GET requests (no body to put it in)
- Visible in browser DevTools network tab for debugging
- No CORS preflight issues from custom headers
- Backend can read from `req.query.tenant_id`

### 2. Skip If Already Present

`!path.includes("tenant_id=")` prevents double-appending when a specific call already passes it (e.g., admin pages that explicitly select a tenant).

### 3. SessionStorage as Source of Truth

The `TenantProvider` React context writes to sessionStorage when the user selects a tenant. The fetch wrapper reads from sessionStorage (not from React context) because:
- The fetch wrapper is a plain function, not a React component — can't use hooks
- SessionStorage persists across page refreshes
- Single source of truth for both React context and API client

### 4. Null = No Filter (Super-Admin)

When no `selectedTenantId` exists in sessionStorage, no `tenant_id` param is appended. The backend middleware interprets this as "show all" (only for super-admins — regular users get their assigned tenant enforced server-side).

## The Companion: TenantProvider

The context provider that populates sessionStorage:

```jsx
export function TenantProvider({ children }) {
  const { user } = useAuth();
  const [selectedTenantId, setSelectedTenantId] = useState(null);

  useEffect(() => {
    if (!user) return;
    if (user.role === "superadmin" || user.role === "admin") {
      // Fetch tenant list, restore from sessionStorage
      const saved = sessionStorage.getItem("selectedTenantId");
      if (saved) setSelectedTenantId(saved);
    } else {
      // Regular user: locked to assigned tenant
      setSelectedTenantId(user.tenant_id);
      sessionStorage.setItem("selectedTenantId", user.tenant_id);
    }
  }, [user]);

  const selectTenant = (tenantId) => {
    setSelectedTenantId(tenantId);
    sessionStorage.setItem("selectedTenantId", tenantId);
  };

  // ...render provider
}
```

## Example Domains

| Domain | Tenant Key | sessionStorage Key |
|--------|-----------|-------------------|
| Industrial SaaS | `plant_id` | `selectedPlantId` |
| E-commerce | `store_id` | `selectedStoreId` |
| Healthcare | `clinic_id` | `selectedClinicId` |
| Education | `school_id` | `selectedSchoolId` |

## Anti-Patterns to Avoid

1. **Passing tenantId as prop through 5 layers** — Use the wrapper pattern instead
2. **Modifying every apiFetch call site** — The whole point is to avoid this
3. **Trusting the frontend-sent tenant_id blindly** — Backend MUST verify ownership via middleware
4. **Using localStorage** — sessionStorage is safer; tenant context should clear on tab close
