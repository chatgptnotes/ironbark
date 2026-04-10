---
name: SCADA Real-Time ReactFlow — Complete Debugging Case Study
description: 12-issue chain that prevented live PLC tag values from updating ReactFlow HMI elements. Documents every failure point and the final working architecture.
source_project: nexaproc
projects_used_in: [nexaproc]
tags: [typescript, react, reactflow, socket.io, zustand, scada, plc, modbus, realtime, debugging]
---

# SCADA Real-Time ReactFlow — Complete Debugging Case Study

## The Goal
Display live PLC tag values on a ReactFlow-based HMI screen viewer. When an operator toggles %M0 on a Schneider M221 PLC, a Gate Valve symbol should change from open (green) to closed (red) within 1 second.

## The Data Path (12 links, all must work)
```
1. Schneider M221 simulator (%M0 coil)
2. → WireGuard VPN tunnel (user PC → VPS)
3. → Modbus TCP read (polling engine on VPS)
4. → Tag Engine (in-memory, emits tagChange/tagUpdate)
5. → Socket.IO server (io.emit to all clients)
6. → nginx reverse proxy (WebSocket upgrade)
7. → Browser Socket.IO client (connects to WS_URL)
8. → Zustand realtime store (updateTagValue → tagVersion++)
9. → ScreenViewerPage (initialNodes useMemo depends on tagVersion)
10. → ReactFlow setNodes (new data object reference)
11. → PidSymbolNode memo'd component (receives new props)
12. → GateValve SVG (renders open/closed based on state prop)
```

## Every Issue Found (in order of discovery)

### Issue 1: ALLOWED_DEVICE_SUBNETS blocked localhost
- **Symptom**: "Host 127.0.0.1 is not in allowed subnets"
- **Fix**: Added `127.0.0.0/8` to `ALLOWED_DEVICE_SUBNETS` in `environment.ts`

### Issue 2: WS_URL defaulting to localhost in production
- **Symptom**: Socket.IO "connected" but 0 clients on server
- **Root cause**: `constants.ts` had `WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001'`. No env var set on Vercel.
- **Fix**: Auto-detect production: `isProduction ? 'https://api.nexaproc.in' : 'http://localhost:3001'`

### Issue 3: PM2 cluster mode split in-memory state
- **Symptom**: Polling started on worker A, Socket.IO clients on worker B, status check returns empty
- **Fix**: Run PM2 with single instance (`-i 1`), not cluster mode

### Issue 4: Socket.IO room subscription chain broken
- **Symptom**: Client connected but never received tag:update events
- **Root cause**: Server used `io.to('tag:UUID').emit()` but client never emitted `subscribe:tags` to join rooms
- **Fix**: Broadcast to ALL clients with `io.emit('tag:update', tagValue)` instead of room-only

### Issue 5: tagChange only fires on VALUE CHANGE
- **Symptom**: Client connected after initial value read, never received updates because value stayed constant
- **Root cause**: `tagEngine.on('tagChange')` only fires when value differs from previous. If coil stays true for 40 minutes, no events after first poll.
- **Fix**: Also broadcast on `tagEngine.on('tagUpdate')` which fires on EVERY poll cycle

### Issue 6: ScreenViewerPage's elementToNode missing tagBindings
- **Symptom**: Debug log showed `No bindings on node — keys: symbolComponent,symbolName,...` (no tagBindings key)
- **Root cause**: ScreenViewerPage had its OWN `elementToNode` function that NEVER included `tagBindings`, `animationRules`, `visibilityRule`, or `clickAction` in the node data
- **Fix**: Added all four fields to the P&ID symbol branch in `elementToNode`

### Issue 7: Valve state mapping — running/stopped vs open/closed
- **Symptom**: Valve disappeared when tag value changed
- **Root cause**: Boolean `true` mapped to `'running'` but GateValve only accepts `'open'|'closed'|'transit'|'fault'|'manual'|'offline'`. Unknown state = no render.
- **Fix**: Check `categoryKey === 'valves'` → map to `open/closed` instead of `running/stopped`

### Issue 8: Animation rules used tag NAME instead of UUID
- **Symptom**: Animation rules never matched — `tagValues.get('tag1')` returned undefined
- **Root cause**: Editor saved `tagId: 'tag1'` (name) but store keys are UUIDs
- **Fix**: Updated database directly via Prisma to replace tag names with UUIDs

### Issue 9: Demo simulation overwriting real-time values
- **Symptom**: Values correct on reload but never updated live
- **Root cause**: `hasRealData` was false (tag values hadn't arrived yet), so demo simulation interval ran every tick, overwriting any real-time state changes with random values
- **Fix**: `if (hasBindings) return;` — disable demo when real tag bindings exist

### Issue 10: Socket.IO ping timeout too aggressive
- **Symptom**: Client connected then disconnected within 2-4 seconds
- **Root cause**: `pingTimeout: 5000` (5 seconds) was too short for browser tab throttling + VPN latency
- **Fix**: Increased to `pingTimeout: 20000` (20 seconds). No security impact — ping is transport health check, not auth.

### Issue 11: useSocket hook disconnected on page navigation
- **Symptom**: Server logs showed `reason: client namespace disconnect` within 3 seconds of every connection
- **Root cause**: `useSocket` hook's cleanup function called `socketService.disconnect()` on component unmount. Every page navigation unmounted and remounted the layout.
- **Fix**: Removed cleanup disconnect. Socket stays alive across navigations. Only disconnects on explicit logout.

### Issue 12: React/ReactFlow re-rendering not triggered by setNodes
- **Symptom**: setInterval + setNodes didn't update the valve visually
- **Root cause**: Multiple competing approaches (interval in parent, useState in child, useMemo with Map dependency) all failed because ReactFlow's memo'd components need specific data flow.
- **Fix**: Resolve tag values INSIDE the `initialNodes` useMemo with `tagVersion` as dependency. When `tagVersion` increments (every tag:update), the entire node array recalculates with live values baked in, then `setNodes(canvasOnlyNodes)` runs — the same code path that works on reload.

## Final Working Architecture

```
Socket.IO event: tag:update
  → useRealtimeStore.updateTagValue() → tagVersion++
  → ScreenViewerPage: tagVersion selector triggers re-render
  → initialNodes useMemo([screen, tagVersion]) recalculates
    → elementToNode() creates node data
    → Tag values resolved from useRealtimeStore.getState().tagValues
    → Animation rules evaluated, state mapped (valves: open/closed)
  → canvasOnlyNodes derived from initialNodes
  → setNodes(canvasOnlyNodes) updates ReactFlow
  → PidSymbolNode receives new data.state prop
  → GateValve renders with new state color
```

## Key Principles Learned

1. **Trace the ENTIRE data path before fixing anything** — we fixed 12 issues one at a time over many deploys. Should have traced all 12 links upfront.

2. **ReactFlow memo'd components only re-render when node.data reference changes** — internal useState/useEffect/setInterval inside memo'd components gets swallowed.

3. **Never have competing intervals** — demo simulation and real-time interval both calling setNodes = chaos.

4. **Socket.IO rooms are complex** — for <100 tags, just `io.emit()` to all clients. Room subscription has too many failure points.

5. **useSocket cleanup should NOT disconnect** — socket connections are expensive to re-establish. Keep alive across page navigations.

6. **tagChange vs tagUpdate** — tagChange fires only on value CHANGE, tagUpdate fires on every poll. For real-time displays, broadcast on tagUpdate.

7. **Same code path for live and reload** — if reload works but live doesn't, make live use the SAME code path as reload (recalculate initialNodes, not patch nodes after creation).
