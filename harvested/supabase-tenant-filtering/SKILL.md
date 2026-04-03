---
name: Supabase Tenant Filtering via Inner Joins
description: Use !inner join + dot-notation filtering to scope Supabase queries through related tables for multi-tenant isolation
source_project: HazPredict-1
projects_used_in: [HazPredict-1]
tags: [supabase, postgresql, postgrest, multi-tenant, joins, security]
harvested: 2026-04-04
---

# Supabase Tenant Filtering via Inner Joins

Pattern for filtering records through related tables in Supabase when the record itself doesn't have a direct tenant column but a parent table does.

## When to Use

- Supabase app where child records (events, logs, assignments) belong to parent entities that have a `tenant_id`
- Need to filter child records by tenant without denormalizing tenant_id onto every table
- PostgREST-based APIs where you need cross-table filtering

## The Problem

Events belong to resources. Resources belong to tenants. You want events for a specific tenant, but events don't have `tenant_id` — only `resource_id`.

```javascript
// WRONG: This fetches ALL events, no tenant filter
const { data } = await supabase
  .from("events")
  .select("*, resources(name, type)")
  .in("status", ["active", "pending"]);
```

## The Solution: `!inner` Join + Dot-Notation Filter

```javascript
// CORRECT: Only fetches events for resources in the specified tenant
const { data } = await supabase
  .from("events")
  .select("*, resources!inner(name, type, tenant_id)")
  .eq("resources.tenant_id", tenantId)
  .in("status", ["active", "pending"]);
```

### Key Details

1. **`!inner`** — Makes the join an INNER JOIN (not LEFT JOIN). Without `!inner`, the filter on the joined table won't exclude records — it'll just return null for non-matching joins.

2. **Include the filter column in select** — You MUST include `tenant_id` in the `resources(...)` select list for the dot-notation filter to work. If you omit it, PostgREST silently ignores the filter.

3. **Dot-notation** — `resources.tenant_id` tells PostgREST to filter on the joined table's column, not the main table.

## Common Patterns

### Filter child records by tenant through parent

```javascript
async function getActiveEvents(tenantId) {
  let query = supabase
    .from("events")
    .select("*, resources!inner(name, type, category, tenant_id)")
    .in("status", ["active", "pending"])
    .order("created_at", { ascending: false });

  if (tenantId) {
    query = query.eq("resources.tenant_id", tenantId);
  }

  const { data, error } = await query;
  return data;
}
```

### Filter devices/clients by tenant through parent

```javascript
let query = supabase
  .from("devices")
  .select("id, device_id, name, status, resources!inner(name, type, tenant_id)")
  .order("last_seen_at", { ascending: false });

if (tenantId) {
  query = query.eq("resources.tenant_id", tenantId);
}
```

### Conditionally apply filter

When `tenantId` is null (super-admin seeing all), skip the filter but keep the join as LEFT (drop `!inner`):

```javascript
async function getEvents(filters = {}) {
  // Use !inner only when filtering — otherwise records with no parent would be excluded
  const joinType = filters.tenant_id ? "!inner" : "";
  let query = supabase
    .from("events")
    .select(`*, resources${joinType}(name, type, tenant_id)`)
    .order("created_at", { ascending: false });

  if (filters.tenant_id) {
    query = query.eq("resources.tenant_id", filters.tenant_id);
  }
  // ...other filters
}
```

## Example Domains

| Domain | Parent Table | Child Table | Tenant Column |
|--------|-------------|-------------|---------------|
| Industrial SaaS | zones | alarms | zones.plant_id |
| E-commerce | products | reviews | products.store_id |
| Healthcare | wards | patient_events | wards.clinic_id |
| Project mgmt | projects | tasks | projects.workspace_id |

## Gotchas

1. **`!inner` changes result set** — Records with no matching join (e.g., orphaned events with deleted parents) will be excluded. This is usually correct for tenant filtering but be aware.

2. **Multiple join levels** — PostgREST supports one level of dot-notation filtering. For deeper chains (event → resource → tenant → org), you may need an RPC function or database view.

3. **Performance** — `!inner` generates a proper SQL INNER JOIN, which Postgres optimizes well with indexes. Ensure the parent table's `tenant_id` has an index.

4. **Filter column must be in select** — If you write `.select("*, resources!inner(name, type)")` without `tenant_id` in the list, then `.eq("resources.tenant_id", tenantId)` silently does nothing. Always include the column you're filtering on.
