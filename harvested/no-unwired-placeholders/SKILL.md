---
name: No Unwired Placeholders — Wire Everything on First Pass
description: Every button, link, and interactive element must have a working onClick/navigation handler from the moment it's created. Never leave placeholder buttons without handlers.
source_project: nexaproc
projects_used_in: [nexaproc]
tags: [typescript, react, ui, architecture, anti-pattern, scada, frontend]
---

# No Unwired Placeholders — Wire Everything on First Pass

## Problem

Developers create UI with buttons, links, and interactive elements as visual placeholders — they look clickable but do nothing when clicked. Users discover these dead buttons and lose trust in the application. Fixing them later requires re-reading the codebase to understand what each button should do.

## Real Example (NexaProc)

The Device Manager had "Browse Tags" and "Configure" buttons that looked clickable but had no `onClick` handlers:

```tsx
// ANTI-PATTERN: Looks interactive but does nothing
<button className="flex w-full items-center justify-between ...">
  <span className="flex items-center gap-2"><Activity size={13} /> Browse Tags</span>
  <ChevronRight size={13} />
</button>
```

Users clicked these expecting navigation — nothing happened.

## The Rule

**Every interactive element must have a working handler from the moment it's created.**

If you don't know the exact destination yet:
- Navigate to a reasonable page: `onClick={() => navigate('/app/engineering/tags')}`
- Show a toast: `onClick={() => toast('Coming soon')}`
- Open a modal: `onClick={() => setModalOpen(true)}`

**NEVER** create a button/link with no `onClick`. The handler can be simple, but it must exist.

## Checklist When Creating UI

- [ ] Every `<button>` has an `onClick` handler
- [ ] Every `<a>` has an `href` or `onClick`
- [ ] Every clickable card/row has a handler
- [ ] Every dropdown option triggers an action
- [ ] Every icon button (edit, delete, settings) has a handler
- [ ] Every "Save"/"Submit" button calls an API
- [ ] Every navigation item routes to a real page
- [ ] Every context menu item has an action

## Audit Command

Search for unwired buttons in any React project:

```bash
# Find buttons without onClick
grep -rn '<button' src/pages/ src/components/ | grep -v 'onClick' | grep -v 'type="submit"'
```

## When This Applies

- Every React/Vue/Angular application
- Every page with interactive elements
- Every SCADA/industrial HMI interface
- Every admin panel and dashboard
