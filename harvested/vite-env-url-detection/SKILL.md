---
name: Vite Environment URL Auto-Detection
description: Frontend apps deployed to Vercel must auto-detect API/WebSocket URLs for production vs development — never default to localhost for both API and Socket.IO
source_project: nexaproc
projects_used_in: [nexaproc]
tags: [vite, react, vercel, environment, socket.io, deployment, configuration]
---

# Vite Environment URL Auto-Detection

## Problem

Vite apps use `import.meta.env.VITE_*` for configuration. When deploying to Vercel without setting env vars, URLs default to `localhost:3001`. The REST API might work because `api.ts` has a separate hardcoded production URL, but the **Socket.IO URL silently fails** — WebSocket tries to connect to localhost which doesn't exist on the production domain.

## Anti-Pattern

```typescript
// constants.ts — breaks in production if VITE_WS_URL not set
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
export const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001';
```

## Correct Pattern

```typescript
// Auto-detect production vs development
const isProduction = typeof window !== 'undefined' && window.location.hostname !== 'localhost';

export const API_URL = import.meta.env.VITE_API_URL 
  || (isProduction ? 'https://api.yourdomain.com/api' : 'http://localhost:3001/api');

export const WS_URL = import.meta.env.VITE_WS_URL 
  || (isProduction ? 'https://api.yourdomain.com' : 'http://localhost:3001');
```

## Why This Matters for Socket.IO

REST API calls can work even with wrong base URL if `api.ts` has its own URL detection. But Socket.IO:
- Connects via `io(WS_URL, {...})` which uses `WS_URL` directly
- A wrong URL means WebSocket never connects
- No connection = no real-time data = `--` everywhere
- The app LOOKS connected (LIVE indicator may use a different check) but receives nothing

## Debugging Clues

| Symptom | Cause |
|---------|-------|
| API calls work, Socket.IO doesn't | WS_URL wrong, API_URL correct |
| "Socket connected" but no data | Connected to wrong server (localhost) |
| Network → WS tab empty | Socket.IO URL is unreachable |
| Works on localhost, breaks on Vercel | Localhost fallback kicking in |

## Prevention

1. **Always set both URLs** together — if API_URL has production detection, WS_URL must too
2. **Use the same detection logic** for both — don't have separate URL resolution
3. **Check Network → WS tab** after deployment to verify WebSocket connects to the right host
4. **Add a console.log** for WS_URL in development: `console.log('[Socket] Connecting to:', WS_URL)`
