---
name: "OpenClaw WhatsApp Echo Loop & LLM Quota Fix"
description: "Stop infinite WhatsApp message loops caused by selfChatMode and quota-exceeded LLM keys in OpenClaw"
source_project: "bot-2-19feb2026"
projects_used_in: ["bot-2-19feb2026"]
tags: [openclaw, whatsapp, llm, echo-loop, quota, self-chat, gateway]
version: 1.0.0
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

### 4. Backed-up failed delivery queue
Old error messages queue for retry and keep flooding users even after the LLM is fixed.

**Fix:**
```bash
rm /root/.openclaw/delivery-queue/failed/*.json   # VPS
rm /Users/murali/.openclaw/delivery-queue/failed/*.json  # Mac
```

---

## Architecture: Two Separate OpenClaw Instances

This project has two instances — always check BOTH when debugging:

| | Mac Gateway | VPS Proxy |
|---|---|---|
| WhatsApp # | Personal (+919373111709) | DoubleTick business number |
| Process | `openclaw-gateway` via launchd | `openclaw-proxy` (PM2) → `openclaw agent --local` |
| Config | `~/.openclaw/openclaw.json` | `/root/.openclaw/openclaw.json` |
| Model (working) | `openai/gpt-4o-mini` | `zhipuai/glm-5.1` |
| SSH | local | `ssh -i ~/.ssh/vps_hostinger root@hopetech.me` |
| Restart | `pkill -f openclaw-gateway` (launchd auto-restarts) | `pm2 restart openclaw-proxy` |

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
