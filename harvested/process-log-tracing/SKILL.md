---
name: Process Log Tracing — Find Logs When Not Under Named Systemd Service
description: When a process logs to systemd journal but isn't registered as a named service, journalctl -u <name> returns nothing. Trace via fd/1 socket inode → ss -xp → journalctl _PID=<pid>.
type: diagnosis
tags: [linux, systemd, journald, logging, debugging, process]
---

# Process Log Tracing — Find Logs When Not Under Named Systemd Service

## Problem

A process is running but `journalctl -u <service-name>` returns 0 results, even though the process appears in `ps aux`. The process may have been started by a script, PM2, or a custom launcher — not a `.service` unit file.

---

## Investigation Chain

### Step 1 — Find the PID
```bash
ps aux | grep <process-name> | grep -v grep
# Note the PID from column 2
```

### Step 2 — Check where stdout/stderr go
```bash
ls -la /proc/<pid>/fd/1 /proc/<pid>/fd/2
```

**Possible results:**

| Result | Meaning |
|--------|---------|
| `-> /var/log/app.log` | Logs to a file — just `tail -f` that file |
| `-> socket:[2212615]` | Logs to a Unix socket — trace the socket next |
| `-> /dev/null` | Logs discarded — nothing to read |
| `-> /dev/pts/0` | Logs to a terminal — attach to that terminal |

### Step 3 — Identify the socket destination
```bash
ss -xp | grep <inode-number>
# e.g. ss -xp | grep 2212615
```

If the result shows `/run/systemd/journal/stdout`:
```
u_str ESTAB ... /run/systemd/journal/stdout 2213444 ... 2212615
```
→ The process IS logging to systemd journal, just not via a named unit.

### Step 4 — Read logs by PID
```bash
journalctl _PID=<pid> --no-pager | tail -50
journalctl _PID=<pid> --since "1 hour ago" --no-pager | grep -i "error\|warn"
```

This bypasses unit-name filtering and queries by PID directly.

---

## Full Example

```bash
# Process found but journalctl -u openclaw-gateway returns 0
$ ps aux | grep openclaw-gateway
root   558754  5.6  3.4 ... openclaw-gateway

$ ls -la /proc/558754/fd/1
lrwx------ ... /proc/558754/fd/1 -> socket:[2212615]

$ ss -xp | grep 2212615
u_str ESTAB ... /run/systemd/journal/stdout 2213444 ... 2212615
#                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ confirmed: goes to journald

$ journalctl _PID=558754 --no-pager | tail -20
# ← actual log output appears here
```

---

## Why This Happens

Processes started outside of systemd unit files (by scripts, PM2, screen, nohup, etc.) still inherit a stdout socket connected to journald if systemd is PID 1 and the parent process was itself a systemd service or journald-connected process. The logs land in the journal but have no `_SYSTEMD_UNIT` field, so `-u <name>` doesn't find them.

---

## Quick Reference

```bash
# Find all processes logging to journald without a named unit
journalctl --no-pager -n 0 --field _PID | while read pid; do
  unit=$(journalctl _PID=$pid -n 1 --output=json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('_SYSTEMD_UNIT','none'))" 2>/dev/null)
  [ "$unit" = "none" ] && echo "PID $pid: no unit"
done

# Or simply — search by process name in journal
journalctl --no-pager | grep 'openclaw-gatewa' | tail -30
```

---

## Example Domains

| Scenario | Applies? |
|----------|----------|
| Node.js app started by a shell script | Yes |
| PM2-managed process | Partial — PM2 has its own log files AND may journal |
| Docker container | No — container logs via docker logs |
| App under a proper .service unit | No — journalctl -u works normally |
