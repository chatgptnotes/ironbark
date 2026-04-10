---
name: Placeholder Audit and Resolution Pattern
description: Systematic scan for empty placeholders, disabled buttons, stub endpoints, dead files, and unmounted routes — then resolve each by either implementing, removing, or returning honest errors
source_project: ampris-1
projects_used_in: [ampris-1]
tags: [typescript, react, express, code-quality, audit, placeholder, stub]
harvested: 2026-04-05
---

# Placeholder Audit and Resolution Pattern

## Problem

Large applications accumulate placeholders over time: disabled buttons with `onClick={() => {}}`, endpoints returning 501, dead stub files, routes that are implemented but never mounted, and "Coming Soon" badges. Users see broken/incomplete features, and developers lose track of what's real vs placeholder.

## Audit Checklist

Search the entire codebase for these patterns:

### Frontend (React/TSX)
```bash
# Disabled buttons with empty handlers
grep -rn 'onClick={() => {}}' --include='*.tsx'

# "Coming Soon" / "Under Construction" text
grep -rn 'Coming Soon\|Under Construction\|Not Available' --include='*.tsx'

# Empty catch blocks (silent error swallowing)
grep -rn 'catch.*{}' --include='*.tsx'

# useState with mock data
grep -rn 'useState.*MOCK\|useState.*mock\|useState.*demo' --include='*.tsx'
```

### Backend (Express/Node)
```bash
# 501 Not Implemented responses
grep -rn 'status(501)' --include='*.ts'

# Math.random() in API responses
grep -rn 'Math.random()' --include='*.ts' apps/server/

# Stub files
grep -rn 'stub\|not used' --include='*.ts' apps/server/src/lib/

# Routes implemented but never mounted
# Compare: route files in routes/ vs imports in app.ts
diff <(ls apps/server/src/routes/) <(grep "import.*from.*routes" apps/server/src/app.ts)
```

## Resolution Decision Tree

For each placeholder found:

1. **Disabled button with empty handler** → Implement the feature or remove the button entirely
2. **"Coming Soon" badge** → If feature exists elsewhere, link to it. If not ready, remove from UI
3. **501 endpoint** → Either implement with real DB queries or remove the route
4. **Dead stub file** → Verify no imports, then delete
5. **Unmounted routes** → Mount in app.ts if implemented, delete if not
6. **Math.random() in responses** → Replace with `null` or real data
7. **Empty catch blocks** → Add `console.error()` at minimum

## Key Findings from Ampris-1 Audit

| Issue | Resolution |
|-------|-----------|
| SetupWizard "Import CSV" button disabled with `onClick={() => {}}` | Implemented CSV parser with file picker |
| OIDC routes fully implemented but never mounted in app.ts | Added `app.use('/api/auth/oidc', oidcRoutes)` |
| `lib/prisma.ts` stub file (`export const prisma = null as any`) | Deleted — real Prisma in `config/database.ts` |
| AI controller falling back to demo data service | Replaced with real DB queries or 501 |
| Analytics `Math.random()` for powerFactor/efficiency | Changed to `null` |

## When to Apply

- Before any production release
- After rapid feature scaffolding sprints
- When users report "this feature doesn't work"
- During quarterly code health reviews
