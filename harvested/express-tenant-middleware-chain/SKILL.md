---
name: Express Tenant Middleware Chain
description: requireAuth → requireTenantAccess → route pattern with profile caching and role-based tenant resolution for multi-tenant Express apps
source_project: HazPredict-1
projects_used_in: [HazPredict-1]
tags: [nodejs, express, multi-tenant, middleware, rbac, security]
harvested: 2026-04-04
---

# Express Tenant Middleware Chain

Pattern for implementing multi-tenant isolation in Express via a middleware chain: `requireAuth → requireTenantAccess → route handler`. Handles role-based tenant resolution and avoids double-fetching user profiles.

## When to Use

- Express API serving multiple tenants (companies, organizations, teams)
- Role hierarchy where some roles see all data and others are scoped
- Already have JWT auth middleware and want to add tenant scoping
- Have an existing `requireRole` middleware that fetches user profiles

## The Middleware Chain

```
Request → requireAuth → requireTenantAccess → route handler
                ↓              ↓                    ↓
          sets req.user    sets req.tenantId     uses req.tenantId
          (from JWT)       sets req.orgId        to filter queries
                           sets req.userProfile
```

### server.js Wiring

```javascript
const requireAuth = require("./middleware/auth");
const requireTenantAccess = require("./middleware/requireTenantAccess");

// Tenant-scoped routes
app.use("/api/resources",     requireAuth, requireTenantAccess, resourceRoutes);
app.use("/api/events",        requireAuth, requireTenantAccess, eventRoutes);
app.use("/api/workspaces",    requireAuth, requireTenantAccess, workspaceRoutes);
app.use("/api/organizations", requireAuth, requireTenantAccess, orgRoutes);

// Public routes — no tenant middleware
app.use("/api/auth",   authLimiter, authRoutes);
app.use("/api/health", healthRoutes);

// API-key routes (external clients) — separate auth, no tenant middleware
app.use("/api/ingest", requireApiKey, ingestLimiter, ingestRoutes);

// Admin routes — requireRole already fetches profile, requireTenantAccess reuses it
app.use("/api/admin", requireAuth, requireRole("superadmin", "admin"), requireTenantAccess, adminRoutes);
```

## The Middleware

```javascript
const db = require("../db");

async function requireTenantAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  // Avoid double-fetch if requireRole already populated the profile
  let profile = req.userProfile;
  if (!profile) {
    const { data, error } = await db
      .from("user_profiles")
      .select("role, tenant_id, is_active")
      .eq("id", req.user.id)
      .single();

    if (error || !data || !data.is_active) {
      return res.status(403).json({ error: "Access denied" });
    }
    profile = data;
    req.userProfile = profile;
  }

  // Determine effective tenant_id based on role
  const requestedTenantId = req.query.tenant_id || req.body?.tenantId;

  if (profile.role === "superadmin") {
    // Superadmin: use requested tenant or null (all)
    req.tenantId = requestedTenantId || null;
  } else if (profile.role === "admin") {
    // Admin: can switch tenants within their organization
    req.tenantId = requestedTenantId || profile.tenant_id;
  } else {
    // Regular users: strictly their assigned tenant
    req.tenantId = profile.tenant_id;
    if (!req.tenantId) {
      return res.status(403).json({ error: "No tenant access assigned" });
    }
  }

  // Resolve organization through the tenant
  if (req.tenantId) {
    const { data: tenant } = await db
      .from("workspaces")
      .select("org_id")
      .eq("id", req.tenantId)
      .single();
    req.orgId = tenant?.org_id || null;

    // Admin guard: verify requested tenant belongs to their organization
    if (profile.role === "admin" && requestedTenantId && profile.tenant_id) {
      const { data: ownTenant } = await db
        .from("workspaces")
        .select("org_id")
        .eq("id", profile.tenant_id)
        .single();
      if (ownTenant && tenant && ownTenant.org_id !== tenant.org_id) {
        return res.status(403).json({ error: "Cannot access tenants outside your organization" });
      }
    }
  } else {
    req.orgId = null;
  }

  next();
}
```

## Role Resolution Table

| Role | `req.tenantId` | `req.orgId` | Can Override? |
|------|---------------|-------------|---------------|
| superadmin | Requested or `null` (all) | Derived or `null` | Yes, any tenant |
| admin | Requested or assigned | Derived, must match own | Yes, within org |
| manager | Assigned tenant | Derived | No |
| viewer | Assigned tenant | Derived | No |

## Using in Route Handlers

```javascript
// List endpoint — filter by tenantId
router.get("/", async (req, res, next) => {
  const resources = getAll(req.tenantId); // null = all, uuid = filtered
  res.json(resources);
});

// Detail endpoint — verify ownership
router.get("/:id", async (req, res, next) => {
  const resource = getById(req.params.id);
  if (!resource) return res.status(404).json({ error: "Not found" });

  // Tenant isolation: return 404 (not 403) to prevent enumeration
  if (req.tenantId && resource.tenant_id !== req.tenantId) {
    return res.status(404).json({ error: "Not found" });
  }

  res.json(resource);
});
```

## Key Design Decisions

### 1. Profile Caching via `req.userProfile`

The `requireRole` middleware already fetches the user profile. `requireTenantAccess` checks `req.userProfile` first and skips the DB call if it's already populated. This prevents double-fetching on admin routes.

### 2. 404 Not 403 for Tenant Violations

When a user tries to access a resource from another tenant, return `404 Not Found` instead of `403 Forbidden`. A 403 confirms the resource exists, enabling enumeration attacks.

### 3. `null` Means "All" (Superadmin Only)

When `req.tenantId` is `null`, route handlers skip the filter and return all records. The middleware only allows this for superadmins. Backend enforcement — never trust the frontend.

### 4. Organization Resolution Through Tenant

Instead of denormalizing `org_id` onto `user_profiles`, resolve it by looking up the tenant's `org_id`. One extra query per request, but keeps the schema normalized. Cache if needed at scale.

## Example Domains

| Domain | Tenant Entity | Org Entity | Hierarchy |
|--------|--------------|-----------|-----------|
| Industrial SaaS | Plant | Company | company → plants → zones |
| E-commerce | Store | Merchant | merchant → stores → products |
| Healthcare | Clinic | Hospital Group | group → clinics → wards |
| Education | School | District | district → schools → classes |

## Checklist

- [ ] Middleware placed AFTER `requireAuth` (needs `req.user`)
- [ ] All list endpoints use `req.tenantId` to filter
- [ ] All detail endpoints verify ownership (return 404, not 403)
- [ ] Admin cross-org access blocked
- [ ] Regular users cannot override their tenant_id
- [ ] `req.userProfile` reused when `requireRole` runs first
- [ ] AI/assistant endpoints also tenant-scoped
