---
name: Multi-Tenant Audit Checklist
description: Systematic methodology for finding multi-tenant data leaks — check every GET endpoint, AI context, external clients, and trace ownership chain
source_project: HazPredict-1
projects_used_in: [HazPredict-1]
tags: [security, multi-tenant, saas, audit, data-isolation, rbac]
harvested: 2026-04-04
---

# Multi-Tenant Audit Checklist

Systematic methodology for auditing multi-tenant SaaS applications for data isolation failures. Discovered when a deep codebase scan revealed that every GET endpoint leaked cross-tenant data.

## When to Use

- Any multi-tenant application where different organizations share the same database
- Before going live with multi-tenant features
- After adding new API endpoints or query logic
- During security reviews

## The Core Problem

Multi-tenant data leaks happen when:
1. The user→tenant ownership chain exists in the schema but is **never enforced in queries**
2. UI components like tenant selectors exist but are **never wired into the app**
3. AI/assistant features are grounded with **unfiltered data from all tenants**

## Audit Steps

### Step 1: Map the Ownership Chain

Trace the full hierarchy from user to data:

```
user_profiles.user_id → user_profiles.tenant_id → workspaces.org_id → organizations.id
                              ↓
                         resources.tenant_id → records.resource_id
                                              → events.resource_id
                                              → devices.tenant_id
```

**Check**: Does every table that holds tenant-specific data have a foreign key path back to the tenant root (e.g., `org_id`)?

### Step 2: Audit Every List Endpoint

For each `GET` endpoint that returns a list:

| Check | Question |
|-------|----------|
| Query filter | Does the SQL/ORM query filter by the authenticated user's tenant? |
| Middleware | Is there a `requireTenantAccess` middleware before the route handler? |
| Default scope | If no filter param is provided, does it return ALL records or only the user's? |

**Common failure**: `.select('*')` with no `.eq('tenant_id', userTenantId)`.

### Step 3: Audit Every Detail Endpoint

For each `GET /:id` endpoint:

| Check | Question |
|-------|----------|
| Ownership | After fetching by ID, does it verify the record belongs to the user's tenant? |
| IDOR | Can a user access `/resources/uuid-from-another-tenant`? |

### Step 4: Audit AI/Assistant Context

AI features are a major leak vector because they aggregate data into system prompts:

| Check | Question |
|-------|----------|
| System prompt | Does the prompt builder filter data by the user's tenant? |
| Tool execution | Do assistant tools (e.g., `query_history`) filter by tenant? |
| Grounding data | Is the AI grounded with data from all tenants or just the user's? |

### Step 5: Audit External Client / Device Endpoints

| Check | Question |
|-------|----------|
| Config endpoint | Can a client fetch config belonging to another tenant? |
| API key scope | Are API keys scoped to a specific tenant? |
| Client auth | Does the client's API key restrict it to its own tenant's data? |

### Step 6: Audit Admin Endpoints

| Check | Question |
|-------|----------|
| User listing | Can a tenant admin see users from other tenants/orgs? |
| Role escalation | Can an admin grant roles for a tenant they don't belong to? |
| Cross-tenant actions | Can an admin modify resources for another tenant? |

### Step 7: Check Frontend Tenant Selectors

| Check | Question |
|-------|----------|
| Provider wired | Is the tenant context provider actually mounted in the app root? |
| Used in API calls | Do API calls pass the selected tenant ID? |
| Persisted | Is the selection persisted across page reloads? |
| Backend enforced | Does the backend verify the user has access to the requested tenant? |

## The Fix Pattern: requireTenantAccess Middleware

```javascript
function requireTenantAccess(req, res, next) {
  const userTenantId = req.user?.tenant_id;
  if (!userTenantId) {
    return res.status(403).json({ error: 'No tenant access assigned' });
  }
  req.tenantId = userTenantId;
  next();
}

// Usage in route
router.get('/resources', requireAuth, requireTenantAccess, async (req, res) => {
  const resources = await db
    .from('resources')
    .select('*')
    .eq('tenant_id', req.tenantId);  // ALWAYS filter by tenant
  res.json(resources);
});
```

## Red Flags to Search For

```bash
# Queries with no tenant filter
grep -r "\.select(" --include="*.js" | grep -v "tenant_id\|org_id\|user_id"

# Routes with no tenant middleware
grep -r "router.get\|router.post" --include="*.js" | grep -v "requireTenantAccess\|requireTenant"

# AI/assistant system prompts loading all data
grep -r "buildSystemPrompt\|systemPrompt" --include="*.js"
```

## Example Domains

| Domain | Tenant | Org | Resource | Event |
|--------|--------|-----|----------|-------|
| Industrial SaaS | Plant | Company | Zone | Alarm |
| E-commerce | Store | Merchant | Product | Order |
| Healthcare | Clinic | Hospital Group | Ward | Patient Alert |
| Education | School | District | Class | Incident |

## Severity Classification

| Finding | Severity |
|---------|----------|
| List endpoints returning cross-tenant data | **CRITICAL** |
| AI grounded with all-tenant data | **CRITICAL** |
| Detail endpoints with no ownership check (IDOR) | **HIGH** |
| Admin endpoints leaking cross-tenant users | **HIGH** |
| Frontend tenant selector not wired | **MEDIUM** |
| Config endpoints without ownership check | **MEDIUM** |
