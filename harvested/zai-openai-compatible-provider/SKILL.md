---
name: Z.AI (Zhipu GLM) Provider Config — OpenAI-Compatible Format
description: Z.AI (bigmodel.cn / zhipuai.cn) uses OpenAI-compatible /chat/completions API. Setting api type to "anthropic-messages" appends /v1/messages and causes 404 errors. Always use openai-completions.
type: fix
tags: [openclaw, zai, zhipu, glm, llm-provider, api-format]
---

# Z.AI Provider Config — Use OpenAI-Compatible Format

## Problem

When configuring Z.AI (Zhipu AI / bigmodel.cn) as an LLM provider in OpenClaw (or any proxy that lets you choose API format), setting:

```json
"api": "anthropic-messages"
```

causes the request URL to be built as:

```
https://open.bigmodel.cn/api/paas/v4/v1/messages   ← 404
```

because `anthropic-messages` appends `/v1/messages` to the base URL.

Z.AI does **not** implement the Anthropic Messages API. It uses OpenAI-compatible endpoints.

---

## Fix

Set the api type to `openai-completions`:

```json
{
  "provider": "zai",
  "model": "glm-4-plus",
  "api": "openai-completions",
  "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
  "apiKey": "YOUR_ZHIPU_API_KEY"
}
```

This routes requests to:
```
https://open.bigmodel.cn/api/paas/v4/chat/completions   ← correct
```

---

## Model names (Z.AI / Zhipu)

| Model | Notes |
|-------|-------|
| `glm-4-plus` | Most capable, primary model |
| `glm-4-flash` | Fast/cheap, good for high-volume tasks |
| `glm-4-long` | 128k context window |
| `glm-4v` | Vision (image understanding) |

---

## Fallback pattern

When z.ai balance runs out (rate limit error), fall back to OpenAI:

```json
{
  "provider": "openai",
  "model": "gpt-4o-mini",
  "api": "openai-completions"
}
```

Restore glm-4-plus as primary once z.ai account is topped up.

---

## Example Domains

| Platform | Applies? |
|----------|----------|
| OpenClaw / clawdbot LLM provider config | Yes — primary context |
| Any OpenAI-compatible proxy (LiteLLM, OpenRouter) | Yes — use openai format |
| Direct HTTP calls to bigmodel.cn | Yes — POST to /chat/completions |
| Vercel AI SDK | Yes — use `openai` provider with custom baseURL |
