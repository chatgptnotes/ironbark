---
name: Exhaustive Error Hunting — Never Stop at the First Fix
description: When debugging a broken feature, NEVER assume the first error found is the only one. Systematically trace the entire data path and fix ALL breakpoints before declaring success.
source_project: nexaproc
projects_used_in: [nexaproc]
tags: [debugging, methodology, scada, socket.io, fullstack, architecture]
---

# Exhaustive Error Hunting — Never Stop at the First Fix

## The Anti-Pattern: Fix One Thing, Declare Victory

When a feature doesn't work, we find one error, fix it, deploy, and ask the user to test. The user reports it still doesn't work. We find another error, fix it, deploy again. Repeat 10 times. Each round-trip wastes 10-15 minutes of the user's time.

## The Real-World Example (NexaProc tag values showing --)

We spent 2 hours fixing "tag value shows --" across 8 separate deployments because we fixed errors one at a time instead of tracing the entire chain upfront:

| Round | Error Found | Deployed? | Still Broken? |
|-------|-----------|-----------|---------------|
| 1 | Polling not started | Yes | Yes |
| 2 | PM2 cluster splits state | Yes | Yes |
| 3 | Socket.IO room subscription missing | Yes | Yes |
| 4 | `io.to(room).emit` needs `io.emit` broadcast | Yes | Yes |
| 5 | `hasRealData` check too strict | Yes | Yes |
| 6 | `WS_URL` defaults to localhost in production | Yes | **FINALLY WORKED** |

Error #6 was the ROOT CAUSE all along. If we had traced the full chain first, we would have found it in 5 minutes.

## The Correct Methodology

### Step 1: Map the ENTIRE data path

Before fixing anything, trace from source to destination:

```
Source: PLC simulator (%M0 coil)
  → VPN tunnel (WireGuard 10.100.0.2 → 10.100.0.1)
  → Modbus TCP read (polling engine on VPS)
  → Tag Engine (in-memory, emits tagChange)
  → Socket.IO (io.emit to connected clients)
  → nginx (reverse proxy, WebSocket upgrade)
  → Browser (Socket.IO client connects to WS_URL)
  → Realtime Store (Zustand, updates tagValues Map)
  → ScreenViewerPage (reads tagValues, applies to nodes)
  → UI (valve changes state/color)
```

### Step 2: Verify EACH link independently

For each link in the chain, verify it works:

```bash
# Link 1: Can VPS reach PLC?
ssh vps "nc -w 2 10.100.0.2 502 && echo OK"

# Link 2: Can Modbus read the coil?
ssh vps "node -e 'require(\"modbus-serial\")... readCoils(0,1)'"

# Link 3: Is polling engine running?
curl /api/polling/status

# Link 4: Is tag engine receiving values?
curl /api/polling/stats  # totalPolls > 0, goodQuality > 0

# Link 5: Is Socket.IO broadcasting?
grep "io.emit" dist/services/realtime.service.js

# Link 6: Is nginx proxying WebSocket?
Check nginx config for /socket.io/ proxy

# Link 7: What URL does the browser connect to?
Check WS_URL in constants.ts — IS IT LOCALHOST?!

# Link 8: Is the browser receiving events?
F12 → Network → WS tab → check for active WebSocket
```

### Step 3: Fix ALL broken links, then deploy ONCE

Don't deploy after each fix. Find ALL issues first, fix them all, deploy once, verify.

## Common Multi-Error Chains in SCADA/Fullstack Apps

### Chain 1: "Data doesn't show in UI"
1. Backend not reading from device (polling not started)
2. Backend reading but not broadcasting (Socket.IO room issue)
3. Broadcasting but wrong URL (WS_URL = localhost)
4. Right URL but client not subscribing (missing emit)
5. Subscribing but store not updating (wrong event name)
6. Store updating but UI not re-rendering (stale closure)

### Chain 2: "Login works but shows wrong user"
1. Real login succeeds (backend returns correct user)
2. But mock login fallback ALSO runs (catches non-401 errors)
3. Mock user overwrites real user in store
4. TopBar has HARDCODED "Operator" text (never reads from store)
5. localStorage has stale auth from previous session

### Chain 3: "CRUD saves but data disappears"
1. Create succeeds (API returns 201)
2. But list refresh fails (limit > backend max)
3. Page shows empty (user thinks create failed)
4. On reload, store initializes with mock data (not from API)
5. Screen store uses Zustand without persistence (lost on refresh)
6. Project ID is non-UUID string from old mock data

## The Rule

**When a feature is broken, trace the ENTIRE data path from source to UI before fixing anything. Verify each link. List ALL broken links. Fix them ALL. Deploy ONCE. Test ONCE.**

Never:
- Fix one thing and ask "try again"
- Assume the first error is the only error
- Deploy 8 times for one feature
- Blame stale cache when the real issue is a wrong URL

## Checklist Before Declaring "Fixed"

- [ ] Traced full data path from source to UI
- [ ] Verified each link independently with evidence
- [ ] Found ALL broken links (not just the first)
- [ ] Fixed all issues in one commit
- [ ] Deployed once
- [ ] Verified end-to-end with user
- [ ] Saved time by not doing 8 round-trips
