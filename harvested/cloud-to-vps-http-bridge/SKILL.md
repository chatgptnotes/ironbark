---
name: cloud-to-vps-http-bridge
description: Lightweight Node.js HTTP bridge that lets a serverless cloud platform (Vercel, Railway, etc.) trigger actions on a self-hosted VPS service — authenticated with an API key, exposed via nginx reverse proxy.
source_project: aiinmail.com/bot-2-19feb2026
projects_used_in: [aiinmail.com]
tags: [vps, vercel, nginx, bridge, node, api-key, pm2, proxy, serverless, whatsapp, openclaw]
harvested_from_session: 2026-04-12
---

# Cloud-to-VPS HTTP Bridge

## Problem

Serverless platforms (Vercel, Railway, Netlify, Lambda) have no persistent state and cannot open direct connections to a self-hosted VPS service. But you need the cloud app to trigger VPS-side actions — sending a WhatsApp message, running a CLI command, posting to a local service.

**Constraints:**
- Cloud app can make outbound HTTPS requests
- VPS has a public IP / domain but no serverless runtime
- The VPS action involves a CLI tool or local service that can't be cloud-hosted
- You want auth without a full OAuth setup

## Solution

Run a lightweight Node.js HTTP server on the VPS. Expose it via nginx at a URL path. The cloud app calls it with an API key header. The bridge server executes the VPS action.

```
Cloud App (Vercel)
  │  POST https://yourdomain.com/bridge/
  │  Header: X-Api-Key: your-secret
  ▼
nginx reverse proxy
  │  proxy_pass http://127.0.0.1:PORT/
  ▼
Node.js bridge server (PM2)
  │  validates API key
  ▼
VPS action (CLI, local HTTP, socket, etc.)
```

## Implementation

### Bridge Server (`bridge-server.js`)

```javascript
const http = require('http');
const { execFile } = require('child_process');

const PORT = 18799;
const API_KEY = process.env.BRIDGE_API_KEY;

if (!API_KEY) {
  console.error('BRIDGE_API_KEY env var required');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  // Health check — no auth required
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'bridge' }));
    return;
  }

  // Auth check
  if (req.headers['x-api-key'] !== API_KEY) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  // Collect body
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    let payload;
    try { payload = JSON.parse(body); } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    // Route actions
    if (req.method === 'POST' && req.url === '/send') {
      const { channel, target, message } = payload;
      if (!channel || !target || !message) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing fields: channel, target, message' }));
        return;
      }

      // Example: trigger openclaw CLI to send a WhatsApp message
      execFile('openclaw', ['message', 'send',
        '--channel', channel,
        '--target', target,
        '--message', message
      ], { timeout: 15000 }, (err, stdout, stderr) => {
        if (err) {
          console.error('Action failed:', err.message, stderr);
          res.writeHead(500);
          res.end(JSON.stringify({ ok: false, error: err.message }));
        } else {
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true, output: stdout.trim() }));
        }
      });
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Unknown endpoint' }));
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Bridge server listening on 127.0.0.1:${PORT}`);
});
```

### Start with PM2

```bash
BRIDGE_API_KEY=your-secret-key pm2 start bridge-server.js --name bridge
pm2 save
```

### nginx Configuration

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    # ... existing SSL config ...

    # Bridge path — note trailing slash on both sides
    location /bridge/ {
        proxy_pass http://127.0.0.1:18799/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 30s;
    }
}
```

Reload nginx: `nginx -t && systemctl reload nginx`

### Cloud App Caller (TypeScript/Next.js)

```typescript
// lib/vps-bridge.ts
const BRIDGE_URL = process.env.VPS_BRIDGE_URL!;  // https://yourdomain.com/bridge
const BRIDGE_KEY = process.env.VPS_BRIDGE_KEY!;

export async function sendViaVPS(params: {
  channel: string;
  target: string;
  message: string;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${BRIDGE_URL}/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': BRIDGE_KEY,
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `Bridge error ${res.status}: ${body}` };
  }

  return res.json();
}
```

### Vercel Environment Variables

```bash
vercel env add VPS_BRIDGE_URL production   # https://yourdomain.com/bridge
vercel env add VPS_BRIDGE_KEY production   # your-secret-key
```

## API Key Generation

```bash
# Generate a strong key
openssl rand -hex 24
# Example: bk-bridge-a8f3d1e9c2b7...
```

Never use a guessable key. Rotate if exposed.

## Health Check

```bash
curl https://yourdomain.com/bridge/health
# {"ok":true,"service":"bridge"}
```

## Example Domains

| Use Case | Cloud Platform | VPS Action | CLI/Service |
|----------|---------------|------------|-------------|
| Send WhatsApp from SaaS | Vercel | openclaw message send | openclaw CLI |
| Trigger background job | Railway | run Python script | python3 |
| Notify on events | Netlify | send Telegram/Slack | curl / bot CLI |
| Execute maintenance tasks | Lambda | run shell command | bash script |
| Push to local IoT gateway | Firebase | serial/MQTT write | custom daemon |

## Security Notes

- Bind bridge server to `127.0.0.1` — never expose directly on public interface
- Always use HTTPS via nginx (not plain HTTP)
- API key in env vars, never in code
- Rate-limit nginx location if needed: `limit_req_zone $binary_remote_addr ...`
- Log all requests for audit: `access_log /var/log/nginx/bridge.log`

## Failure Modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `502 Bad Gateway` | Bridge server not running | `pm2 status` → `pm2 restart bridge` |
| `401 Unauthorized` | Key mismatch | Verify env var in PM2: `pm2 env 0` |
| `404 on /bridge/send` | nginx trailing slash issue | Ensure both `location /bridge/` and `proxy_pass .../` have trailing slash |
| Timeout from cloud | VPS action takes >30s | Increase `proxy_read_timeout` or make action async |
| Bridge starts then crashes | `BRIDGE_API_KEY` not set in PM2 | `pm2 start bridge.js --env production` with correct env |
