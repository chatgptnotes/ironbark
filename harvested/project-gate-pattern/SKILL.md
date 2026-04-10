---
name: Project Gate Pattern
description: Enforce project selection before accessing project-scoped pages — gate at layout level, not per-page
source_project: nexaproc
projects_used_in: [nexaproc]
tags: [typescript, react, react-router, scada, multi-tenant, authorization]
---

# Project Gate Pattern

## Problem

Multi-project apps (SCADA, SaaS, multi-tenant) have pages that require an active project context. Without enforcement, users land on empty pages with confusing "no data" states. Adding project checks to every page is tedious and easy to forget.

## Pattern: Gate at Layout Level

```tsx
// ProjectGate.tsx — wrapper component
function ProjectGate({ children }: { children: React.ReactNode }) {
  const activeProject = useProjectStore(s => s.activeProject);
  if (!activeProject) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <FolderOpen size={64} />
        <h2>Select a Project First</h2>
        <Link to="/app/projects">Go to Projects</Link>
      </div>
    );
  }
  return <>{children}</>;
}

// ScadaLayout.tsx — gate at the layout Outlet
const PROJECT_FREE_ROUTES = ['/app/dashboard', '/app/projects', '/app/admin', '/app/settings'];

function ScadaLayout() {
  const { pathname } = useLocation();
  const needsProject = !PROJECT_FREE_ROUTES.some(r => pathname.startsWith(r));

  return (
    <main>
      {needsProject ? <ProjectGate><Outlet /></ProjectGate> : <Outlet />}
    </main>
  );
}
```

## Why Layout Level > Per-Page

| Approach | Pros | Cons |
|----------|------|------|
| Per-page check | Explicit | Easy to forget, boilerplate in 30+ pages |
| **Layout gate** | **One place, covers all routes** | Must maintain exclusion list |
| Route middleware | Clean separation | More complex routing setup |

## Key Decisions

1. **Allowlist approach** (`PROJECT_FREE_ROUTES`) — safer than blocklist. New pages default to requiring a project
2. **Uses `pathname.startsWith()`** — catches nested routes automatically
3. **Shows actionable UI** — not just an error, but a link to the Projects page
4. **Uses Zustand `persist` middleware** — project selection survives page refresh

## When This Applies

- Multi-project SCADA/industrial apps
- Multi-tenant SaaS with workspace/org selection
- Any app where most pages need a context object before they're useful
