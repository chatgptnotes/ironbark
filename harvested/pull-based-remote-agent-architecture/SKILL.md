---
name: pull-based-remote-agent-architecture
description: Remote shell execution on NAT-bound IoT/edge devices via cloud-polling agent. Device pulls commands from HTTPS API instead of accepting inbound SSH, bypassing carrier-grade NAT and dynamic IPs. Includes daemon + sibling-cron watchdog pattern.
source_project: flownexus
projects_used_in: [flownexus]
tags: [iot, edge, remote-shell, nat-traversal, openwrt, teltonika, daemon, watchdog, supabase]
harvested_from_session: 2026-04-10
---

# Pull-Based Remote Agent Architecture

## Problem

You need to run shell commands on edge devices (IoT gateways, cellular routers, field equipment) that sit behind:
- Carrier-grade NAT (no public IP)
- Dynamic IPs that change with cellular reconnects
- Firewall rules that block inbound SSH
- Sleep/power cycling that breaks long-lived SSH sessions

Traditional SSH does not work. Reverse SSH tunnels are fragile and hard to multi-tenant. VPN overlays (WireGuard, Tailscale) add operational overhead.

## Solution

Flip the direction: the device polls a cloud HTTPS API for pending commands and posts results back. All connections are outbound, so NAT and dynamic IPs are irrelevant.

```
Device (daemon)  ──[HTTPS poll every 5s]──▶  Cloud API /api/remote/pending
                 ◀──[command JSON]────────
                 ──[HTTPS POST result]───▶  Cloud API /api/remote/result

Operator (web)  ──[POST command]────────▶  Cloud API /api/remote/command
                                              │
                                              ▼
                                         remote_commands table
```

## Core Components

### 1. Database schema (Supabase/Postgres)

```sql
create table remote_commands (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  command text not null,
  status text not null default 'pending',  -- pending | running | completed | failed | timeout
  submitted_by text not null,
  timeout_secs int not null default 30,
  exit_code int,
  output text,
  error_message text,
  metadata jsonb,
  created_at timestamptz default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index on remote_commands (device_id, status, created_at);
```

### 2. API endpoints (Next.js App Router example)

- `POST /api/remote/command` — operators queue a command (session auth OR API key)
- `GET /api/remote/pending?device_id=X` — device polls for next pending (API key only)
- `POST /api/remote/result` — device posts result (API key only)
- `GET /api/remote/history?device_id=X` — operators review results

**Critical: atomic claim on `pending`** to prevent double-execution if multiple agents race:

```typescript
// Fetch oldest pending
const { data: command } = await supabase
  .from('remote_commands')
  .select('*')
  .eq('device_id', deviceId)
  .eq('status', 'pending')
  .order('created_at', { ascending: true })
  .limit(1)
  .single()

// Optimistic-lock update: only succeeds if still pending
const { data: updated } = await supabase
  .from('remote_commands')
  .update({ status: 'running', started_at: new Date().toISOString() })
  .eq('id', command.id)
  .eq('status', 'pending')  // ← guard clause
  .select()
  .single()
```

### 3. Safety: command blocklist

Reject dangerous commands server-side before inserting:

```typescript
const BLOCKED_PATTERNS = [
  /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?\/\s*$/,     // rm -rf /
  /\bsysupgrade\b/,                               // OpenWrt firmware flash
  /\bmkfs\b/,
  /\bfirstboot\b/,                                // OpenWrt factory reset
  /\bdd\s+.*of=\/dev\//,
  /\bpasswd\b/,
  /\breboot\b.*-f/,
  />\s*\/dev\/sd/,
  /\bcurl\b.*\|\s*(sh|bash)/,                    // pipe-to-shell downloads
  /\bwget\b.*\|\s*(sh|bash)/,
  /\bopkg\s+remove\b/,                            // OpenWrt package removal
]
```

Also enforce:
- Per-device pending cap (e.g., 5) to prevent queue flooding
- `timeout_secs` clamped to a max (e.g., 120s)
- Admin-only role for command submission (non-API-key path)

### 4. Device-side daemon

The long-running agent on the device polls in a loop. Key design choices:

- **PID file** at `/var/run/<name>.pid` for single-instance enforcement
- **Trap INT/TERM** for clean shutdown
- **`curl -k` with `-w "\n%{http_code}"`** to capture HTTP status separately from body
- **`timeout <secs> sh -c "$cmd"`** to kill runaway commands (fall back to manual PID-kill loop on systems without `timeout`)
- **Output truncation** (e.g., 10 KB) to prevent giant payloads
- **`logger -t <tag>`** for syslog integration (works everywhere)

### 5. Watchdog via sibling cron (KEY INSIGHT)

The daemon itself cannot restart itself if it crashes or is OOM-killed. Solution: a **different** script running under cron (for unrelated reasons) also checks the daemon PID and restarts it if dead. In FlowNexus, the data-sender cron job (`fluxio_sender.sh`, `* * * * *`) does double duty:

```sh
# Watchdog block at end of the cron-scheduled data sender
if [ -f /root/fluxio_remote.sh ]; then
    REMOTE_PID=$(cat /var/run/fluxio_remote.pid 2>/dev/null)
    if [ -z "$REMOTE_PID" ] || ! kill -0 "$REMOTE_PID" 2>/dev/null; then
        log "WATCHDOG: Remote agent not running, restarting..."
        killall -q fluxio_remote.sh 2>/dev/null
        rm -f /var/run/fluxio_remote.pid
        nohup /root/fluxio_remote.sh >/dev/null 2>&1 &
        sleep 1
        if kill -0 $! 2>/dev/null; then
            log "WATCHDOG: Remote agent restarted (PID $!)"
        fi
    fi
fi
```

**Why this is non-obvious:** You might assume you need a dedicated init.d service or procd respawn directive. Piggy-backing on an existing cron job is simpler, survives package upgrades, and requires no special boot integration. The cost is up-to-1-minute recovery time after a crash.

## Health Check Pattern

To verify the agent is alive, queue a diagnostic command through the same API and poll history:

```bash
# 1. Queue
curl -sk -X POST https://api.example.com/api/remote/command \
  -H "Content-Type: application/json" \
  -H "x-api-key: $KEY" \
  -d '{
    "device_id":"GATEWAY_001",
    "command":"echo === UPTIME ===; uptime; echo === PROCESSES ===; ps w | grep -E \"agent|modbus\" | grep -v grep; echo === DISK ===; df -h /",
    "timeout_secs":30
  }'

# 2. Wait poll_interval + exec_time (e.g., 10-15s)

# 3. Fetch history
curl -sk "https://api.example.com/api/remote/history?device_id=GATEWAY_001&limit=1" \
  -H "x-api-key: $KEY"
```

**Expected latency** = poll interval (5s) + queue claim + command exec + result POST. Typical: 3-10s end-to-end.

**`=== SECTION ===` markers** make multi-command output readable in a single round-trip. Alternative: structured JSON via `jq` (not available on BusyBox — use this pattern instead).

## Trade-offs

| Aspect | Pull-based agent | Reverse SSH | WireGuard |
|---|---|---|---|
| NAT traversal | ✓ (outbound only) | ✓ | ✓ |
| Latency | Poll interval (5s typical) | Instant | Instant |
| Bandwidth idle | HTTPS poll every 5s (~500 B) | TCP keepalive | UDP keepalive |
| Multi-tenancy | Natural (device_id scoping) | Hard (per-device ports) | VPN IP planning |
| Crash recovery | Watchdog cron | Auto-reconnect | Auto-reconnect |
| Audit trail | Built-in via DB | Session logs | None |
| Works behind carrier-grade NAT | ✓ | ✗ (needs public bastion) | ✓ |

**Use pull-based agent when:** you need audit trail, web-UI integration, multi-tenant isolation, and can tolerate seconds of latency.

**Use reverse SSH when:** you need interactive terminals or sub-second latency and have a public bastion.

## Gotchas

1. **Dynamic IPs break SSH-based watchdogs.** The watchdog must not try to SSH anywhere. Do everything local-to-the-device.
2. **Poll interval is a trade-off.** 5s feels responsive but generates 17k requests/day/device. At scale, consider longer intervals (30s) with a "boost mode" triggered by SMS or MQTT.
3. **Output size limits matter.** Uncapped `logread` dumps can crash the JSON parser. Always truncate server-side-bound output.
4. **API key rotation is hard.** The device must be updated, and it lives behind NAT. Build key rotation support into the daemon from day one: read key from a config file, reload on SIGHUP, and queue rotations via the API itself.
5. **Race on claim.** Without the optimistic-lock `WHERE status='pending'` guard, two concurrent polls can execute the same command twice.
6. **Time drift.** Devices may have stale clocks. Log `created_at` from the server, not the device.

## Reference implementation

See `flownexus` repo:
- `scripts/fluxio_remote.sh` — daemon (sh + Lua, BusyBox-compatible)
- `scripts/fluxio_sender_deploy.sh:107-124` — watchdog block
- `src/app/api/remote/command/route.ts` — operator submission with blocklist
- `src/app/api/remote/pending/route.ts` — device poll + atomic claim
- `src/app/api/remote/result/route.ts` — result ingestion
- `supabase/migrations/20260217000000_remote_commands.sql` — schema
