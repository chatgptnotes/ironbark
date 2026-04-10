---
name: PM2 Cluster Mode Breaks In-Memory SCADA State
description: PM2 cluster mode causes polling engine, tag engine, and Socket.IO room subscriptions to split across workers — use single instance for SCADA backends with in-memory state
source_project: nexaproc
projects_used_in: [nexaproc]
tags: [nodejs, pm2, scada, cluster, socket.io, polling, architecture]
---

# PM2 Cluster Mode Breaks In-Memory SCADA State

## Problem

SCADA backends have in-memory state (polling sessions, tag engine values, Socket.IO room subscriptions). PM2 cluster mode runs multiple Node.js workers. API requests and Socket.IO connections get load-balanced to different workers, so:

- Worker A starts polling → tag values stored in Worker A's memory
- Socket.IO client connects to Worker B → no tag values there
- Polling status check goes to Worker B → returns empty `{status: []}`
- Tag updates emitted by Worker A → only clients connected to Worker A receive them

## Symptoms

- Polling shows "started" but status returns empty
- Socket.IO shows "connected" but tag values show `--`
- Historian flushes data (proving polling works) but frontend gets nothing
- Test connection succeeds but device stays "offline"

## Fix

```bash
# Single instance — all state in one process
pm2 start dist/index.js --name nexaproc-api -i 1

# NOT this — splits state across workers
pm2 start dist/index.js --name nexaproc-api -i 2
```

## When Cluster Mode IS Safe

Only if ALL of these are true:
- Tag engine state is in Redis (not in-memory Map)
- Polling sessions are in Redis (not in-memory Map)
- Socket.IO uses Redis adapter (`@socket.io/redis-adapter`) for cross-worker broadcasting
- Session/room state is shared via Redis pub/sub

## Also Broadcast to All Clients

Even with single instance, use `io.emit()` (broadcast to all) instead of `io.to(room).emit()` for tag updates — the room subscription flow has too many failure points:

```typescript
tagEngine.on('tagChange', (tagValue) => {
  if (io) {
    io.emit('tag:update', tagValue);  // All clients get it
  }
});
```

## When This Applies

- Any SCADA/industrial backend with in-memory polling/tag state
- IoT platforms with device connection state
- Real-time apps where Socket.IO rooms depend on application-level subscriptions
