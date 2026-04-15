---
name: EventEmitter → Socket.IO → Zustand Reactive Pipeline
description: Full backend-to-frontend reactive chain using Node EventEmitter as source, Socket.IO rooms for transport, and Zustand store for state — with mock EventEmitter test pattern for verifying UI auto-updates without a running server
source_project: nexaproc
projects_used_in: [nexaproc]
tags: [typescript, nodejs, socket.io, zustand, react, eventemitter, realtime, testing, vitest]
harvested: 2026-04-15
---

# EventEmitter → Socket.IO → Zustand Reactive Pipeline

Complete pattern for pushing backend events to the frontend UI with automatic React re-rendering. Uses Node's EventEmitter as the event source, Socket.IO rooms for scoped transport, and Zustand for state management.

## When to Use

- Backend service generates events that should update the UI in real time
- You need project/tenant-scoped event delivery (not broadcast to all clients)
- You want testable real-time flows without running a Socket.IO server

## The Full Pipeline

```
┌── BACKEND ─────────────────────────────────────────────────────────┐
│                                                                     │
│  service.ts                                                         │
│    export const serviceEvents = new EventEmitter();                 │
│    serviceEvents.emit('entity:update', payload);                    │
│              │                                                      │
│  realtime.service.ts                                                │
│    serviceEvents.on('entity:update', (data) => {                    │
│      io.to(`scope:${data.scopeId}`).emit('entity:update', data);   │
│    });                                                              │
│              │                                                      │
└──────────────┼──────────────────────────────────────────────────────┘
               │  Socket.IO (room-scoped)
               ▼
┌── FRONTEND ────────────────────────────────────────────────────────┐
│                                                                     │
│  socket.service.ts                                                  │
│    socket.on('entity:update', (data) => {                           │
│      useEntityStore.getState().addEntity(data);                     │
│    });                                                              │
│                                                                     │
│  useEntityStore.ts (Zustand)                                        │
│    addEntity: (item) => set((state) => ({                           │
│      items: [item, ...state.items.filter(i => i.id !== item.id)]    │
│    }));                                                             │
│                                                                     │
│  Component.tsx                                                      │
│    const items = useEntityStore(s => s.items);  // auto-re-renders  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Step 1: Backend Event Source

```typescript
// domain-service.ts
import { EventEmitter } from 'events';

export const domainEvents = new EventEmitter();

export interface DomainEvent {
  readonly entityId: string;
  readonly scopeId: string;  // project, tenant, or room identifier
  readonly data: SomePayload;
  readonly timestamp: string;
}

// Emit after the business logic completes
async function processEntity(entity: Entity): Promise<void> {
  const result = await doWork(entity);
  await persistResult(result);

  domainEvents.emit('domain:update', {
    entityId: entity.id,
    scopeId: entity.projectId,
    data: result,
    timestamp: new Date().toISOString(),
  } satisfies DomainEvent);
}
```

**Key**: The EventEmitter is a module-level export. Other services subscribe to it without coupling to the emitting service's internals.

## Step 2: Realtime Service Forwards to Socket.IO

```typescript
// realtime.service.ts
import { domainEvents } from './domain-service';

export function initRealtimeService(io: SocketIOServer): void {
  // ... existing subscriptions ...

  domainEvents.on('domain:update', (data: DomainEvent) => {
    const scopeId = typeof data.scopeId === 'string' ? data.scopeId : null;
    if (scopeId && io) {
      io.to(`scope:${scopeId}`).emit('domain:update', data);
    }
  });
}
```

**Why validate scopeId**: Defensive — if the emitter sends malformed data, don't crash the realtime service. Broadcast to `undefined` room would leak to all clients.

## Step 3: Frontend Socket Listener

```typescript
// socket.service.ts
this.socket.on('domain:update', (data: DomainEvent) => {
  useEntityStore.getState().addEntity(data);
});
```

**Why `getState()` instead of a hook**: Socket handlers run outside React's render cycle. `getState()` is the correct way to update Zustand from non-React code.

## Step 4: Zustand Store with Immutable Dedup

```typescript
// useEntityStore.ts
interface EntityState {
  items: DomainEvent[];
  addEntity: (item: DomainEvent) => void;
  clearEntities: () => void;
}

export const useEntityStore = create<EntityState>((set) => ({
  items: [],

  addEntity: (item) => {
    set((state) => {
      // Deduplicate by entityId — keep latest
      const filtered = state.items.filter(i => i.entityId !== item.entityId);
      return { items: [item, ...filtered] };
    });
  },

  clearEntities: () => set({ items: [] }),
}));
```

**Why dedup**: The same entity may emit multiple events. Without dedup, the list grows unbounded and shows stale entries.

## Testing Pattern: Mock EventEmitter

The key insight: you can test the entire pipeline without running Socket.IO. A mock `EventEmitter` simulates what `socket.service.ts` does.

```typescript
// entity-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { useEntityStore, DomainEvent } from '@/stores/useEntityStore';

describe('useEntityStore — real-time updates via mock emitter', () => {
  let mockSocket: EventEmitter;

  beforeEach(() => {
    // Reset store
    useEntityStore.setState({ items: [] });

    // Mock socket — simulates socket.service.ts behavior
    mockSocket = new EventEmitter();
    mockSocket.on('domain:update', (data: DomainEvent) => {
      useEntityStore.getState().addEntity(data);
    });
  });

  it('auto-updates store when backend emits event', () => {
    expect(useEntityStore.getState().items).toHaveLength(0);

    mockSocket.emit('domain:update', {
      entityId: 'e-1',
      scopeId: 'proj-1',
      data: { value: 42 },
      timestamp: new Date().toISOString(),
    });

    const items = useEntityStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].entityId).toBe('e-1');
  });

  it('deduplicates by entityId — keeps latest', () => {
    mockSocket.emit('domain:update', {
      entityId: 'e-1', scopeId: 'p1', data: { value: 1 },
      timestamp: new Date().toISOString(),
    });
    mockSocket.emit('domain:update', {
      entityId: 'e-1', scopeId: 'p1', data: { value: 2 },
      timestamp: new Date().toISOString(),
    });

    const items = useEntityStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].data.value).toBe(2);
  });

  it('maintains separate entries for different entities', () => {
    mockSocket.emit('domain:update', {
      entityId: 'e-1', scopeId: 'p1', data: { value: 1 },
      timestamp: new Date().toISOString(),
    });
    mockSocket.emit('domain:update', {
      entityId: 'e-2', scopeId: 'p1', data: { value: 2 },
      timestamp: new Date().toISOString(),
    });

    expect(useEntityStore.getState().items).toHaveLength(2);
  });
});
```

**Why this works**: Zustand stores are plain JavaScript — no React rendering needed. The mock EventEmitter replaces the Socket.IO transport, testing the store logic directly.

## Testing Pattern: Backend EventEmitter → Socket.IO Forwarding

```typescript
// realtime-forwarding.test.ts
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';

describe('realtime.service — event forwarding', () => {
  it('forwards domain events to the correct Socket.IO room', () => {
    const mockRoom = { emit: vi.fn() };
    const mockIo = { to: vi.fn().mockReturnValue(mockRoom) };

    const domainEvents = new EventEmitter();

    // Simulate what initRealtimeService wires up
    domainEvents.on('domain:update', (data: any) => {
      if (typeof data.scopeId === 'string') {
        mockIo.to(`scope:${data.scopeId}`).emit('domain:update', data);
      }
    });

    domainEvents.emit('domain:update', {
      entityId: 'e-1', scopeId: 'proj-42', data: {},
    });

    expect(mockIo.to).toHaveBeenCalledWith('scope:proj-42');
    expect(mockRoom.emit).toHaveBeenCalledWith(
      'domain:update',
      expect.objectContaining({ entityId: 'e-1', scopeId: 'proj-42' }),
    );
  });
});
```

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Pattern |
|-------------|---------------|-----------------|
| `io.emit()` (broadcast) | All clients receive all events regardless of scope | `io.to(room).emit()` |
| Direct service-to-socket coupling | Service imports `io` → tight coupling, untestable | EventEmitter decouples service from transport |
| `useEntityStore.subscribe()` in socket handler | Creates subscription leak | `getState().action()` for non-React updates |
| Mutable array push in store | Breaks React's referential equality check | Immutable spread: `[item, ...filtered]` |
| No dedup in store | Unbounded list growth, stale entries | Filter by ID before adding |

## Relationship to Other Skills

- **socketio-room-subscription-chain**: Covers the *client subscription* side (joining rooms). This skill covers the *event emission* side (backend → frontend).
- **multi-channel-alert-gateway**: Routes alerts to external channels (SMS, email). This skill routes events to connected browser clients.
