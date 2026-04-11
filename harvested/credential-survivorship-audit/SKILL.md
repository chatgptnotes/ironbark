---
name: Credential Survivorship Audit
description: When a credentials-based failure recurs after a previous fix, the credential was only partially removed. Grep all config locations first, fix second, grep-verify after — before restarting the service. Also: test the underlying component directly (bypassing proxies) to isolate failure faster.
type: pattern
---

# Credential Survivorship Audit

## Problem

You fix an auth failure (expired key, quota-exceeded token, wrong credential) by removing the credential. The bot/service works again. A week or month later, the exact same failure message reappears. You go back and find the **same credential still present in a different location** you missed the first time.

Config-driven services (LLM gateways, OpenClaw, LangChain, etc.) store credentials in 3–10 places: config file env sections, per-agent auth profiles, OAuth state files, systemd/launchd service definitions, PM2 env, `.env` files, credential stores. A partial cleanup causes identical recurrence.

## The Recurrence Anti-Pattern

```
First incident → fix A → service restored
Second incident → same error message → same root cause, different location of credential
Third incident → ...
```

If the error message is identical to a prior incident, it almost always means the fix was incomplete — not that a new credential appeared.

## Solution

**Grep-before-fix, grep-verify-after.** Don't rely on memory of what you fixed last time.

### Step 1 — Grep all possible locations first

```bash
# Find EVERY occurrence of the credential name across the entire config dir
grep -r "ANTHROPIC\|anthropic" ~/.openclaw/
grep -r "OLD_API_KEY\|old_service" ~/.myapp/

# Or for a broader service root
grep -rn "CREDENTIAL_NAME" /root/.service-name/ /etc/service-name/ ~/.service-name/
```

This shows you ALL locations at once before you touch anything.

### Step 2 — Fix all locations in one pass

Don't fix one and restart. Fix every location you found in step 1:

```
config.json env section          → remove the key
per-agent/auth-profiles.json    → set to {"version":1,"profiles":{}}
per-agent/auth-state.json       → clear usageStats
credentials/oauth.json          → set to {}
systemd service file            → remove Environment=CREDENTIAL_*
launchd plist                   → remove EnvironmentVariables entries
PM2 ecosystem.config.js         → remove from env block
.env file                       → remove the line
```

### Step 3 — Grep-verify before restart

```bash
# Must return zero results
grep -r "CREDENTIAL_NAME" ~/.service-config/
# If anything comes back — fix it now, before restarting
```

### Step 4 — Test the underlying component directly

Before restarting the proxy/gateway layer, test the internal component directly to confirm the fix works:

```bash
# Bad: restart proxy, send a real user message, wait, check logs
pm2 restart my-proxy && ...

# Good: invoke the underlying command directly, see the output immediately
my-service run --agent my-agent --local -m "test" --timeout 20
```

Direct testing:
- Bypasses the proxy → failures are isolated to the service, not the proxy
- Returns output synchronously → no log-tailing needed
- Confirms the fix before any user traffic hits it
- Catches config validation errors (e.g., unrecognized keys) that only surface at runtime

Only restart the proxy **after** the direct test passes.

## Config Validation Trap

When editing a config file, only set keys that the service recognizes. An unrecognized key (even a sensible-looking one like `"model"`) silently or loudly breaks the config:

```bash
# Always validate config before restart
my-service doctor
my-service config validate
# Or just run the service in dry-run / --help mode to catch schema errors early
```

If the service has no validator, do a direct component test (step 4 above) — it will fail fast with a config error rather than silently misbehaving.

## Quick Reference Checklist

- [ ] `grep -r CREDENTIAL_NAME ~/.<service>/` → find all locations
- [ ] Remove credential from every location found
- [ ] `grep -r CREDENTIAL_NAME ~/.<service>/` → verify zero results
- [ ] Direct component test (bypass proxy) → confirm response
- [ ] Restart proxy/service
- [ ] Monitor first few real requests in logs

## Example Domains

| Domain | Credential that survives partial cleanup | Config locations to check |
|--------|------------------------------------------|--------------------------|
| LLM gateway (OpenClaw, LiteLLM) | ANTHROPIC_OAUTH_TOKEN, OPENAI_API_KEY | openclaw.json env, auth-profiles.json, oauth.json, systemd |
| Stripe integration | STRIPE_SECRET_KEY | .env, config.json, systemd, k8s secret |
| Database credentials | DB_PASSWORD | .env, app.config.js, docker-compose.yml, CI secrets |
| OAuth app | CLIENT_SECRET | .env, config.yaml, provider dashboard, local keychain |
| SMS/WhatsApp API | TWILIO_AUTH_TOKEN | .env, config.json, serverless.yml, PM2 env |
