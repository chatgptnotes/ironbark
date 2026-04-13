---
name: Claude Code Permanent SSH Access to VPS
description: Set up passwordless SSH key access so Claude Code can run remote commands on a VPS directly via Bash tool, without prompting for a password each time. One-time setup, permanent access.
type: setup
tags: [ssh, vps, claude-code, devops, linux, automation]
---

# Claude Code Permanent SSH Access to VPS

## Problem

Claude Code can only SSH to a VPS if it either:
- Has a private key already installed (`~/.ssh/id_*`)
- Or the user types the password interactively each time

Without this setup, every `ssh root@host "command"` in a Bash tool call fails with `Permission denied` unless the user manually enters the password — which Claude Code cannot do.

---

## One-Time Setup

### Step 1 — Check for an existing key
```bash
ls ~/.ssh/id_*.pub 2>/dev/null || echo "no keys"
```

### Step 2 — Generate if none exists
```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N "" -C "claude-code-access"
```

- `-t ed25519` — modern, small, fast key type
- `-N ""` — no passphrase (required for non-interactive use by Claude)
- `-C "claude-code-access"` — label for the authorized_keys entry on the server

### Step 3 — Install on server (user does this once, password required)
```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub root@YOUR_VPS_IP
```

### Step 4 — Verify
```bash
ssh -i ~/.ssh/id_ed25519 -o StrictHostKeyChecking=no root@YOUR_VPS_IP "echo 'access OK'"
```

---

## After Setup — Claude Uses This Pattern

```bash
ssh -i ~/.ssh/id_ed25519 root@76.13.244.21 "command here"
```

Or add to `~/.ssh/config` for cleaner usage:

```
Host vps
  HostName 76.13.244.21
  User root
  IdentityFile ~/.ssh/id_ed25519
  StrictHostKeyChecking no
```

Then Claude can use: `ssh vps "command"`

---

## Restarting Background Node.js Processes (No Systemd)

Once SSH access is set up, restarting processes that run via `nohup` (not systemd):

```bash
# Kill by process name pattern
ssh -i ~/.ssh/id_ed25519 root@host "pkill -f 'openclaw-proxy' 2>/dev/null; sleep 1; nohup node /root/app.js >> /tmp/app.log 2>&1 & echo started"

# Verify it came back
ssh -i ~/.ssh/id_ed25519 root@host "pgrep -a -f 'app.js'"
```

**Note:** `kill $(pgrep ...)` fails in single-quoted SSH commands because `$()` expands locally. Use `pkill -f pattern` instead.

---

## Security Notes

- No passphrase means anyone with access to `~/.ssh/id_ed25519` can reach the VPS
- Acceptable for local dev machines; not for shared/CI environments
- Consider limiting the key's allowed commands in `authorized_keys` if needed:
  ```
  command="journalctl _PID=$1" ssh-ed25519 AAAA... claude-code-access
  ```

---

## Example Domains

| Use case | Command pattern |
|----------|----------------|
| Check logs | `ssh vps "journalctl _PID=1234 --no-pager | tail -50"` |
| Edit config | `ssh vps "python3 -c \"import json; ...\""` |
| Restart service | `ssh vps "systemctl restart myapp"` |
| Restart nohup process | `ssh vps "pkill -f myapp; nohup node /root/myapp.js >> /tmp/myapp.log 2>&1 &"` |
| Check process list | `ssh vps "ps aux | grep myapp | grep -v grep"` |
