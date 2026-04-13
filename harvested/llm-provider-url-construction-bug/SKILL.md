---
name: "LLM Provider baseUrl + API-Type URL Construction Bug"
description: "When a custom LLM provider's baseUrl already includes a version suffix and the gateway appends /v1/messages, you get /{version}/v1/messages → 404. Diagnose from the path in the error, not the HTTP status."
source_project: "bot-2-19feb2026"
projects_used_in: ["bot-2-19feb2026"]
tags: [llm, openclaw, litellm, gateway, provider, baseUrl, 404, anthropic-messages, openai-completions]
version: 1.0.0
---

# Skill: LLM Provider baseUrl + API-Type URL Construction Bug

## Problem Pattern

A custom LLM provider is configured in a gateway (OpenClaw, LiteLLM, etc.) with:
- A `baseUrl` that ends with a version suffix like `/v4`
- An `api` type that auto-appends its own path segment like `anthropic-messages` → `/v1/messages`

Result: the gateway constructs `{baseUrl}/v1/messages` → `https://provider.com/api/paas/v4/v1/messages` → **404 Not Found**.

The 404 error body looks like:
```json
{"timestamp":"...","status":404,"error":"Not Found","path":"/v4/v1/messages"}
```

The key diagnostic signal is `/v4/v1/messages` in the path — two version segments stacked.

---

## Root Cause

Each `api` type appends a fixed path:

| api type | appended path |
|----------|--------------|
| `anthropic-messages` | `/v1/messages` |
| `openai-completions` | `/v1/chat/completions` |
| `openai-responses` | `/v1/responses` |

If `baseUrl` already ends with `/v4`, the final URL becomes:
```
https://provider.com/path/v4/v1/messages   ← WRONG (404)
```

Correct `baseUrl` should end at the path root, letting the api-type append the version:
```
https://provider.com/path                   ← RIGHT
→ https://provider.com/path/v1/messages
```

---

## Diagnosis Checklist

When a WhatsApp/Telegram bot stops replying with 404 errors:

1. **Read the path in the 404** — `/v4/v1/messages` means double-version stacking
2. **Find the provider config** — check `models.json` or `openclaw.json` → `models.providers`
3. **Check `baseUrl` for a trailing version** — `/v4`, `/v3`, `/v2` at the end is the bug
4. **Check `api` type** — `anthropic-messages` or `openai-completions` both auto-append
5. **Decide**: strip trailing version from baseUrl, OR switch to a working provider

---

## Fix Options

### Option A: Fix the baseUrl (if you control the provider endpoint)

```json
// BEFORE (broken)
"zai": {
  "baseUrl": "https://api.z.ai/api/coding/paas/v4",
  "api": "anthropic-messages"
}

// AFTER (fixed) — strip /v4 from the end
"zai": {
  "baseUrl": "https://api.z.ai/api/coding/paas",
  "api": "anthropic-messages"
}
```

### Option B: Switch primary model to a known-working provider (fastest fix)

```bash
# OpenClaw: edit openclaw.json agents.defaults.model.primary
python3 -c "
import json
path = '/root/.openclaw/openclaw.json'
cfg = json.load(open(path))
cfg['agents']['defaults']['model']['primary'] = 'openrouter/auto'
json.dump(cfg, open(path,'w'), indent=2)
"
# Gateway hot-reloads this field — no restart needed
```

---

## Example Domains

| Domain | Provider Example | Bad baseUrl | Good baseUrl |
|--------|-----------------|-------------|--------------|
| Z.AI (ZhipuAI) | `zai/glm-4-plus` | `https://api.z.ai/api/coding/paas/v4` | `https://api.z.ai/api/coding/paas` |
| Azure OpenAI | `azure/gpt-4o` | `https://myapp.openai.azure.com/openai/v1` | `https://myapp.openai.azure.com/openai` |
| Self-hosted Ollama proxy | `local/llama3` | `http://localhost:11434/api/v1` | `http://localhost:11434/api` |

---

## Hot-Reload Behaviour (OpenClaw-specific)

OpenClaw gateway watches `openclaw.json` for changes and hot-reloads certain fields including `agents.defaults.model.primary`. You will see in systemd logs:

```
[reload] config change detected; evaluating reload (agents.defaults.model.primary)
[reload] config hot reload applied (agents.defaults.model.primary)
```

No restart needed for model changes. Other config changes (channels, auth) typically require restart.

---

## Critical: Per-Agent Model Override Takes Precedence Over Default

When changing `agents.defaults.model.primary`, also check `agents.list[]` for per-agent overrides:

```json
"agents": {
  "defaults": { "model": { "primary": "openrouter/auto" } },  // ← change this
  "list": [
    { "id": "main", "model": "zai/glm-4-plus" }              // ← AND this!
  ]
}
```

The per-agent `model` field overrides the default — changing only the default while the per-agent override remains will still fail. Fix both in one python3 call:

```bash
python3 -c "
import json
path = '/root/.openclaw/openclaw.json'
cfg = json.load(open(path))
new_model = 'anthropic/claude-haiku-4-5-20251001'
cfg['agents']['defaults']['model']['primary'] = new_model
for agent in cfg.get('agents', {}).get('list', []):
    if agent.get('id') == 'main':
        agent['model'] = new_model
json.dump(cfg, open(path,'w'), indent=2)
"
# Gateway hot-reloads both fields in one pass
```

## Which Provider Actually Has Keys?

Before switching models, verify which providers have real credentials:

```bash
# Check systemd env for API keys
cat /root/.config/systemd/user/openclaw-gateway.service | grep -i "_API_KEY\|_TOKEN"

# Check agent auth-profiles.json for token-based auth
cat /root/.openclaw/agents/main/agent/auth-profiles.json
```

| Provider | Where key lives | Check |
|----------|----------------|-------|
| Anthropic | `auth-profiles.json` (`token` type) | `lastGood.anthropic` present |
| OpenRouter | systemd `OPENROUTER_API_KEY` env | look in service file |
| OpenAI | systemd `OPENAI_API_KEY` env | look in service file |
| ZAI | `openclaw.json` models.providers.zai.apiKey | inline in config |

## Related

- `openclaw-whatsapp-loop-fix` — other reasons the bot stops responding
- `credential-survivorship-audit` — stale credentials surviving config changes
