---
name: ReactFlow Node Data Persistence
description: Fix silent data loss in ReactFlow editors where elementsToNodes/nodesToElements serialization drops custom fields like tag bindings, animation rules, and click actions
source_project: nexaproc
projects_used_in: [nexaproc]
tags: [typescript, react, reactflow, xyflow, scada, hmi, serialization]
---

# ReactFlow Node Data Persistence

## Problem

ReactFlow-based editors (HMI, diagram, workflow) store elements as ReactFlow `Node[]` at runtime but serialize to a custom `Element[]` for persistence (DB, JSON). The serialization functions (`elementsToNodes` and `nodesToElements`) are written once for core properties (position, size, label) but silently **drop** any fields added later (tag bindings, animation rules, click actions, metadata).

This creates a devastating UX bug: users configure properties in the editor, hit Save, and everything looks fine — but on reload, the configuration is gone. No error, no warning.

## Anti-Pattern

```typescript
// nodesToElements — hardcodes tagBindings to empty array
const base = {
  id: node.id,
  position: node.position,
  tagBindings: [],  // BUG: ignores node.data.tagBindings
};

// P&ID symbol branch — doesn't extract custom fields
return {
  ...base,
  size: d.size,
  rotation: d.rotation,
  state: d.state,
  // tagBindings, animationRules, clickAction MISSING
};
```

## Safe Pattern

```typescript
// nodesToElements — extract all custom fields from node.data
const nd = node.data as Record<string, any>;
const base = {
  id: node.id,
  position: node.position,
  tagBindings: nd.tagBindings ?? [],
  animationRules: nd.animationRules,
  visibilityRule: nd.visibilityRule,
  clickAction: nd.clickAction,
};

// ALSO fix elementsToNodes — carry fields INTO node.data
result.push({
  id: el.id,
  type: 'pidSymbol',
  position: el.position,
  data: {
    ...coreProps,
    tagBindings: el.tagBindings,
    animationRules: el.animationRules,
    visibilityRule: el.visibilityRule,
    clickAction: el.clickAction,
  },
});
```

## Key Principles

1. **Both directions must be fixed** — `elementsToNodes` (load) AND `nodesToElements` (save)
2. **Use `?? []` / `?? undefined`** for backward compatibility with existing saved data
3. **Test with a round-trip assertion**: serialize → deserialize → compare. Any field that doesn't survive is a bug
4. **Every branch needs fixing** — if you have 15 node types with `if/else` branches, EVERY branch must extract/inject custom fields
5. **The base object is the best place** for fields shared across all node types

## When This Applies

- Any ReactFlow/XYFlow-based editor with save/load
- Diagram editors, workflow builders, SCADA HMI editors
- Any serialization layer between runtime objects and persistence format
