---
name: LLM Chat Context — History Depth and Temperature Config
description: Configure conversation history depth (maxHistoryMessages) and temperature on a deployed LLM chatbot to prevent context amnesia and hallucination drift. Covers OpenClaw, LangChain, and raw API patterns.
type: pattern
tags: [llm, temperature, context, history, openclaw, chatbot, whatsapp, conversation]
---

# LLM Chat Context — History Depth and Temperature Config

## Problem

A deployed chatbot exhibits two common symptoms:
1. **Context amnesia** — every reply feels like the bot is meeting the user for the first time; it doesn't remember what was said 2 messages ago
2. **Hallucination drift** — responses feel creative, disconnected, or make up facts; especially bad with higher temperatures (>0.8)

Both are configuration problems, not model problems.

---

## Root Causes

| Symptom | Root Cause |
|---------|------------|
| "Restarting" every message | No conversation history passed to LLM; each call is stateless |
| Weird, ungrounded replies | Temperature too high (>0.8) for a factual assistant |
| Slow, repetitive responses | Too much history (>20 messages) passed on every call |
| Ignores recent context | History not sorted by recency; oldest messages weighted too high |

---

## Fix 1 — Set History Depth

### OpenClaw (openclaw.json)

```json
{
  "agents": {
    "defaults": {
      "maxHistoryMessages": 12
    }
  }
}
```

**Rule of thumb:**
- `8–12` for WhatsApp/Telegram bots — fast, focused
- `15–20` for support/research bots — more context needed
- Never exceed `25` unless context window is very large (>100k tokens)

### LangChain / LlamaIndex

```python
from langchain.memory import ConversationBufferWindowMemory

memory = ConversationBufferWindowMemory(
    k=12,                    # keep last 12 exchanges
    return_messages=True,
    memory_key="chat_history"
)
```

### Raw API (messages[] pattern)

```python
def build_messages(history: list, new_message: str, system: str) -> list:
    """Keep last N exchanges + current message."""
    MAX_HISTORY = 12
    recent = history[-MAX_HISTORY:]   # slice to last N
    messages = [{"role": "system", "content": system}]
    messages.extend(recent)
    messages.append({"role": "user", "content": new_message})
    return messages
```

---

## Fix 2 — Set Temperature

### Recommended Values by Use Case

| Use Case | Temperature | Reasoning |
|----------|-------------|-----------|
| WhatsApp personal assistant | 0.5–0.6 | Grounded, direct, no hallucination |
| Customer support bot | 0.3–0.5 | Accurate, consistent responses |
| Creative writing assistant | 0.7–0.9 | Varied, expressive |
| Code generation | 0.1–0.3 | Deterministic, correct |
| General conversational bot | 0.6–0.7 | Sweet spot: natural but grounded |

### OpenClaw (openclaw.json) — Two places to set it

```json
{
  "agents": {
    "defaults": {
      "temperature": 0.6
    }
  },
  "models": {
    "providers": {
      "zai": {
        "models": [
          {
            "id": "glm-4-plus",
            "temperature": 0.6
          }
        ]
      }
    }
  }
}
```

### Raw API

```python
response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=messages,
    temperature=0.6,
    max_tokens=512
)
```

---

## Fix 3 — System Prompt Context Awareness Rule

Even with history configured, add an explicit instruction to the system prompt so the model *uses* the history:

```markdown
## Conversation Context Rule

Always read the last 10–15 messages from this sender before replying.
- Reference prior context — never restart cold
- If a topic was already addressed, don't repeat; just confirm or update
- Track conversation state: is this a new request or a continuation?
- If you know the user's name, role, or preferences from history — use them
```

---

## Verification — Check It's Working

After deploying: send 3–4 messages in sequence, then ask "what did I just tell you?". The bot should accurately summarise the recent exchange. If it can't, history is not being passed.

```bash
# OpenClaw: check logs to see context size per call
journalctl _PID=$(pgrep openclaw-gateway) --no-pager | grep -i "token\|context\|history" | tail -20
```

---

## Example Domains

| Platform | Where to Set |
|----------|-------------|
| OpenClaw | `openclaw.json` agents.defaults + models.providers |
| LangChain | ConversationBufferWindowMemory(k=12) |
| LlamaIndex | ChatMemoryBuffer(token_limit=4000) |
| Raw OpenAI/Anthropic | Slice messages[] array before each API call |
| Rasa / Botpress | Tracker store slot history depth |
