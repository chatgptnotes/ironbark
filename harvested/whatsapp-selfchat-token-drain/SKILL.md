---
name: WhatsApp Self-Chat Loop — Token Drain Diagnosis
description: When LLM balance drains faster than expected on a WhatsApp bot, check for self-chat loop (bot replying to its own number) and oversized per-call context. Both together can burn thousands of dollars of tokens per day.
type: diagnosis
tags: [whatsapp, openclaw, llm, token-drain, self-chat, rate-limit, budget]
---

# WhatsApp Self-Chat Loop — Token Drain Diagnosis

## Symptoms

- LLM provider balance drains rapidly despite "low traffic"
- Rate limit errors with large `Requested` token counts per call
- Both primary and fallback providers hit limits quickly
- Logs show inbound messages from the bot's own number

## Diagnostic Log Signatures

### Self-chat loop (same number both sides)
```
[whatsapp] Inbound message +919373111709 -> +919373111709 (direct, 69 chars)
[whatsapp] Sent message ... -> sha256:0a87dab9b1eb
[whatsapp] Inbound message +919373111709 -> +919373111709 (direct, 173 chars)
[whatsapp] Sent message ...
```
The sender and recipient are the **same number**. Every reply the bot sends triggers another inbound, which triggers another reply — infinite loop.

### Oversized context per call
```
Rate limit reached for gpt-4o-mini on TPM: Limit 200,000, Used 144,408, Requested 68,995
```
**68,995 tokens requested for a single WhatsApp message** is abnormal. Normal short-message calls should be 1,000–5,000 tokens. 69k means the agent is loading a huge system prompt, long memory, or full conversation history on every call.

---

## Root Causes

| Cause | How to check |
|-------|-------------|
| `selfChatMode` enabled | `grep -i 'selfChat\|self_chat' /root/.openclaw/openclaw.json` |
| Bot's own number in allowlist without loop guard | Check allowlist API — is the bot's own number whitelisted? |
| Oversized system prompt | `wc -c /root/.openclaw/agents/main/agent/system-prompt.md` |
| Long memory/context loaded per call | Check agent memory settings — cap conversation history |
| Two instances running simultaneously (Mac + VPS) | `ps aux | grep openclaw` on both machines |

---

## Checks

```bash
# 1. Check for self-chat in recent logs (substitute correct PID)
journalctl _PID=<gateway-pid> --no-pager | grep "Inbound" | awk '{print $8}' | sort | uniq -c | sort -rn | head -10

# 2. Count calls per number in last 24h
journalctl _PID=<gateway-pid> --since "24 hours ago" --no-pager | grep "Inbound" | grep -oP '\+\d+' | sort | uniq -c | sort -rn

# 3. Check system prompt size
wc -c /root/.openclaw/agents/main/agent/system-prompt.md

# 4. Check selfChatMode
grep -i 'selfChat\|selfchat\|own.*number' /root/.openclaw/openclaw.json

# 5. Check if same number sending repeatedly
journalctl _PID=<pid> --since "1 hour ago" --no-pager | grep "Inbound" | head -40
```

---

## Fixes

### Fix self-chat loop
```json
// openclaw.json — disable selfChatMode
{
  "agents": {
    "defaults": {
      "selfChatMode": false
    }
  }
}
```

Or block the bot's own number in the proxy script:
```js
const BLOCKED_NUMBERS = ['+919373111709']; // bot's own number
```

### Fix oversized context
- Truncate conversation history: set `maxHistoryMessages: 10` in agent config
- Reduce system prompt — remove unnecessary instructions
- Switch to a cheaper model with smaller context for simple messages

### Emergency stop
```bash
# Kill gateway to stop token burn immediately
kill $(pgrep openclaw-gateway)
# Then fix config before restarting
```

---

## Token Cost Reference

| Context size | Approx cost/call (gpt-4o-mini) | Calls before $1 burned |
|-------------|-------------------------------|----------------------|
| 2,000 tokens | $0.0003 | ~3,300 |
| 10,000 tokens | $0.0015 | ~660 |
| 69,000 tokens | $0.01 | ~100 |

At 69k tokens/call with a self-chat loop firing every 30 seconds: **~$28/hour**.

---

## Example Domains

| Platform | Applies? |
|----------|----------|
| WhatsApp bot (OpenClaw, Baileys, WPP-Connect) | Yes — primary context |
| Telegram bot | Yes — same loop pattern possible |
| Any webhook-based LLM chatbot | Yes — any bot that can message itself |
