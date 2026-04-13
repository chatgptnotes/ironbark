---
name: "OpenClaw WhatsApp Echo Loop & LLM Quota Fix"
description: "Stop infinite WhatsApp message loops caused by selfChatMode and quota-exceeded LLM keys in OpenClaw. Also covers zai/custom provider 404 bug and full Mac removal procedure."
source_project: "bot-2-19feb2026"
projects_used_in: ["bot-2-19feb2026"]
tags: [openclaw, whatsapp, llm, echo-loop, quota, self-chat, gateway, zai, provider, 404, mac-removal]
version: 1.1.0
---

# Skill: Fix OpenClaw WhatsApp Echo Loop & LLM Quota Errors

## Problem Pattern
WhatsApp bot floods all chats with error messages like:
> "LLM request rejected: You're out of extra usage. Add more at claude.ai/settings/usage"

This creates an infinite loop: bot sends error → WhatsApp multi-device sync echoes the sent message back as inbound → bot processes it again → sends another error → repeats.

---

## Root Causes (check all of these)

### 1. selfChatMode: true (most dangerous)
In `openclaw.json`, `channels.whatsapp.selfChatMode: true` causes the gateway to process its own sent messages as new inbound messages → infinite loop.

**Fix:**
```json
"channels": {
  "whatsapp": {
    "selfChatMode": false
  }
}
```

### 2. Quota-exceeded LLM key
When the configured LLM API key hits quota, OpenClaw sends the error as a WhatsApp reply to the user. Combined with selfChatMode, this creates a flood.

**Fix:** Switch to a working model. Options:
- `openai/gpt-4o-mini` — if OPENAI_API_KEY is set (works in gateway)
- `zhipuai/glm-5.1` via z.ai — for VPS proxy `--local` mode only (NOT gateway catalog)
- `openrouter/auto` — if OPENROUTER_API_KEY is set (works in gateway)

**Important:** Gateway built-in catalog ≠ per-agent models.json.
- Gateway (running as service) only supports its built-in catalog: `openai/*`, `openrouter/*`, `anthropic/*` etc.
- Per-agent `models.json` only works when calling `openclaw agent --local` (proxy mode).

### 3. Stale Anthropic credentials in multiple places
OpenClaw looks for auth in this order — clear ALL of them:
```
~/.openclaw/agents/<agent>/agent/auth-profiles.json  → set to {"version":1,"profiles":{}}
~/.openclaw/credentials/oauth.json                   → set to {}
~/.openclaw/agents/<agent>/agent/auth-state.json     → clear usageStats: {}
openclaw.json env section                            → remove ANTHROPIC_API_KEY, ANTHROPIC_OAUTH_TOKEN
systemd/launchd service file                         → remove ANTHROPIC_* Environment lines
```

**Recurrence note (2026-04-11):** ANTHROPIC_OAUTH_TOKEN survived a previous cleanup in openclaw.json env section. This caused a second "bot stopped responding" incident. After fixing once, always grep to verify:
```bash
grep -i anthropic /root/.openclaw/openclaw.json
```
Should return nothing.

**Actual fallback after Anthropic removed:** The proxy (`openclaw agent --local`) automatically uses the next available provider in models.json. In practice it selects `openrouter/auto` — NOT zhipuai/glm-5.1 — even though zhipuai is defined. Both work fine.

**Do NOT add a top-level `"model"` key to openclaw.json** — it's an unrecognized field and causes `Config invalid` errors.

### 5. Custom provider baseUrl + api-type URL mismatch (e.g. zai/glm-4-plus)

When a custom provider (e.g. `zai`) has `api: "anthropic-messages"` and a `baseUrl` ending with a version like `/v4`, OpenClaw appends `/v1/messages` → `/v4/v1/messages` → **404**.

Error in systemd logs:
```
[agent] embedded run agent end: isError=true model=glm-4-plus provider=zai error=404 {"status":404,"error":"Not Found","path":"/v4/v1/messages"}
[agent] embedded run failover decision: decision=surface_error reason=model_not_found provider=zai/glm-4-plus
```

**Fix:** Change primary model to `openrouter/auto` (gateway hot-reloads this field):
```bash
ssh -i ~/.ssh/vps_hostinger root@hopetech.me "python3 -c \"
import json
path = '/root/.openclaw/openclaw.json'
cfg = json.load(open(path))
cfg['agents']['defaults']['model']['primary'] = 'openrouter/auto'
json.dump(cfg, open(path,'w'), indent=2)
\""
```
See `llm-provider-url-construction-bug` skill for the full diagnosis pattern.

### 4. Backed-up failed delivery queue
Old error messages queue for retry and keep flooding users even after the LLM is fixed.

**Fix:**
```bash
rm /root/.openclaw/delivery-queue/failed/*.json   # VPS
rm /Users/murali/.openclaw/delivery-queue/failed/*.json  # Mac
```

---

## Architecture: Single Instance (VPS only, as of 2026-04-13)

**Mac openclaw was fully removed on 2026-04-13.** Only the VPS instance remains.

| | VPS Gateway + Proxy |
|---|---|
| WhatsApp # | Personal (+919373111709) via gateway |
| Process | `openclaw-gateway` (systemd) + `openclaw-proxy` (PM2) |
| Config | `/root/.openclaw/openclaw.json` |
| Model (working) | `openrouter/auto` (gateway default) |
| SSH | `ssh -i ~/.ssh/vps_hostinger root@hopetech.me` |
| Restart gateway | `systemctl --user restart openclaw-gateway` |
| Restart proxy | `pm2 restart openclaw-proxy` |

### Full Mac Removal Procedure (reference)

If you need to remove openclaw from a Mac completely:
```bash
# 1. Find all launchd plists (may be named openclaw OR clawdbot)
ls ~/Library/LaunchAgents/ | grep -iE 'openclaw|claw'

# 2. Unload and remove each plist
launchctl unload ~/Library/LaunchAgents/<plist-name>.plist
rm ~/Library/LaunchAgents/<plist-name>.plist

# 3. Verify process is gone
ps aux | grep -E 'openclaw|clawdbot' | grep -v grep

# 4. Uninstall npm packages (both old and new names)
npm list -g --depth=0 | grep -E 'claw|openclaw'
npm uninstall -g clawdbot openclaw
# If npm uninstall fails with ENOTEMPTY:
rm -rf ~/.npm-global/lib/node_modules/openclaw

# 5. Optionally remove data dirs (ask user first)
# rm -rf ~/.openclaw ~/.clawdbot
```

Note: the package may be named `clawdbot` (old) or `openclaw` (new) — check both.

---

## Step-by-Step Fix Checklist

1. **Stop the loop immediately**
   - Mac: `pkill -f openclaw-gateway`
   - VPS: `pm2 stop openclaw-proxy` (if VPS gateway is the issue)

2. **Clear delivery queue** (stops retrying old error messages)
   ```bash
   rm ~/.openclaw/delivery-queue/failed/*.json 2>/dev/null
   ```

3. **Fix selfChatMode** in openclaw.json:
   ```json
   "channels": { "whatsapp": { "selfChatMode": false } }
   ```

4. **Remove all Anthropic credentials** (all 5 locations above)

5. **Switch model** to a working one (openai/gpt-4o-mini for Mac gateway)

6. **Restart**
   - Mac: `pkill -f openclaw-gateway` then launchd auto-restarts it
   - VPS: `pm2 restart openclaw-proxy`

7. **Verify** in logs:
   - Mac: `grep "agent model" /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log`
   - VPS: `pm2 logs openclaw-proxy --lines 20 --nostream`

---

## Launchd Services (Mac)

```bash
# Stop everything (gateway + keep-alive scripts)
launchctl unload ~/Library/LaunchAgents/ai.openclaw.gateway.plist
launchctl unload ~/Library/LaunchAgents/com.openclaw.whatsapp-keeper.plist
launchctl unload ~/Library/LaunchAgents/com.openclaw.whatsapp-monitor.plist

# Restart
launchctl load ~/Library/LaunchAgents/ai.openclaw.gateway.plist
launchctl load ~/Library/LaunchAgents/com.openclaw.whatsapp-keeper.plist
launchctl load ~/Library/LaunchAgents/com.openclaw.whatsapp-monitor.plist
```

---

## WhatsApp Allowlist

`dmPolicy: "allowlist"` — only numbers in `channels.whatsapp.allowFrom` get responses.
To add a number:
```python
import json
path = '/Users/murali/.openclaw/openclaw.json'
cfg = json.load(open(path))
cfg['channels']['whatsapp']['allowFrom'].append('+91XXXXXXXXXX')
json.dump(cfg, open(path,'w'), indent=2)
# Gateway hot-reloads — no restart needed
```

---

## VPS Gateway: Disable WhatsApp Channel (stop VPS echo loop)

The VPS gateway's personal WhatsApp channel should stay disabled — DoubleTick handles business WhatsApp.
```json
"channels": { "whatsapp": { "enabled": false } }
```
Then: `systemctl --user restart openclaw-gateway`
