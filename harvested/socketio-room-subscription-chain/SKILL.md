---
name: Socket.IO Room Subscription Chain
description: Complete the subscribe chain — frontend store must emit subscribe event to server, server must join client to room, then room-scoped emit works
source_project: nexaproc
projects_used_in: [nexaproc]
tags: [typescript, react, socket.io, zustand, realtime, scada]
---

# Socket.IO Room Subscription Chain

## Problem

Socket.IO room-based broadcasting requires a complete chain:
1. Server defines rooms and broadcasts to them
2. Client must emit a subscribe event to join rooms
3. Client store must trigger the socket emit

If any link is missing, clients connect but receive no data.

## The Broken Chain (What We Found)

```
Server: io.to('tag:UUID').emit('tag:update', data)  ← broadcasts to room
Server: socket.on('subscribe:tags', ids => socket.join('tag:'+id))  ← joins room
Client store: subscribeToTags(ids) → just updates local Set  ← NEVER emits to server!
Client socket: socket.on('tag:update', handler)  ← listens but never joins room
```

## The Fix

```typescript
// Store must emit to socket server
subscribeToTags: (tagIds) => {
  set(state => ({ subscribedTags: new Set([...state.subscribedTags, ...tagIds]) }));
  // THIS WAS MISSING:
  socketService.subscribeToTags(tagIds);
},

// Socket service must emit the event
subscribeToTags(tagIds: string[]) {
  if (this.socket?.connected) {
    this.socket.emit('subscribe:tags', tagIds);
  }
}
```

## Simpler Alternative: Broadcast to All

For SCADA systems with <100 tags, just broadcast to all connected clients:

```typescript
// Server — no rooms needed
tagEngine.on('tagChange', (tagValue) => {
  io.emit('tag:update', tagValue);  // All clients
});
```

This eliminates the subscription chain entirely. Only use rooms when you have 1000+ tags and need to reduce bandwidth per client.

## When This Applies

- Any Socket.IO app using room-based subscriptions
- SCADA/IoT dashboards with tag/sensor subscriptions
- Real-time apps where Zustand/Redux stores manage socket subscriptions
