---
name: SCADA Screen Persistence Pattern
description: HMI screens stored in Zustand must persist to database via API — loadScreens on mount, save on create/update/delete
source_project: nexaproc
projects_used_in: [nexaproc]
tags: [typescript, react, zustand, scada, hmi, persistence, crud]
---

# SCADA Screen Persistence Pattern

## Problem

HMI/SCADA screen editors store screens in a Zustand store initialized with demo data. Screens are lost on page refresh because they never persist to a database.

## Anti-Pattern

```typescript
const useScreenStore = create((set) => ({
  screens: makeDemoScreens(),  // Lost on refresh!
  addScreen: (s) => set(prev => ({ screens: [...prev.screens, s] })),
  updateScreen: (id, u) => set(prev => ({
    screens: prev.screens.map(s => s.id === id ? {...s, ...u} : s)
  })),
}));
```

## Correct Pattern

```typescript
const useScreenStore = create((set) => ({
  screens: [],  // Start empty

  loadScreens: async (projectId) => {
    const res = await api.get('/screens', { params: { projectId } });
    set({ screens: res.data.data });
  },

  addScreen: (screen) => {
    set(prev => ({ screens: [...prev.screens, screen] }));
    api.post('/screens', { name: screen.name, projectId: screen.projectId, elements: screen.elements });
  },

  updateScreen: (id, updates) => {
    set(prev => ({
      screens: prev.screens.map(s => s.id === id ? {...s, ...updates} : s)
    }));
    api.put(`/screens/${id}`, updates);  // Persist to DB
  },

  deleteScreen: (id) => {
    set(prev => ({ screens: prev.screens.filter(s => s.id !== id) }));
    api.delete(`/screens/${id}`);
  },
}));
```

## Backend: ProjectPage Model

```prisma
model ProjectPage {
  id        String   @id @default(uuid())
  name      String
  projectId String
  elements  Json?    // Stores ScreenElement[] as JSON
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
}
```

## Key: Load on Mount

The screens list page must call `loadScreens(projectId)` in useEffect:

```typescript
useEffect(() => {
  if (projectId) loadScreens(projectId);
}, [projectId]);
```

## When This Applies

- Any SCADA/HMI screen editor with save/load
- Dashboard builders with user-created layouts
- Any Zustand store managing user-created content that should persist
