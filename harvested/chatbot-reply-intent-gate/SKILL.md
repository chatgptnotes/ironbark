---
name: Chatbot Reply/Ignore Intent Gate
description: System prompt pattern that adds a first-pass REPLY vs IGNORE decision layer to any chatbot, preventing it from replying to casual acknowledgments like "ok", "thanks", emoji reactions, and mid-conversation acks.
type: pattern
tags: [chatbot, whatsapp, system-prompt, openclaw, telegram, slack, intent, silence]
---

# Chatbot Reply/Ignore Intent Gate

## Problem

A chatbot replies to **every** incoming message — including "ok", "thanks", "👍", "noted", "seen", and emoji reactions. This:
- Annoys users who are just acknowledging a previous message
- Burns LLM tokens on empty exchanges
- Makes the bot feel robotic and context-unaware
- Can trigger reply loops if the ack itself prompts another ack

## Solution

Add an explicit **intent gate** as the very first section of the system prompt. The model evaluates the message before generating a response and outputs nothing if the message is an acknowledgment.

---

## System Prompt Pattern

Place this as **STEP 1** at the top of your system prompt, before any persona or capability instructions:

```markdown
## ⚡ STEP 1 — REPLY vs IGNORE (Check This FIRST, Before Every Response)

Before generating ANY response, silently evaluate the incoming message intent.

### Output NOTHING (empty string) if the message is:
- A simple acknowledgment: "ok", "okay", "k", "thanks", "thank you", "noted",
  "seen", "received", "sure", "fine", "alright", "got it", "hmm", "yep", "yup",
  "yes" (alone, with no question attached)
- An emoji-only reaction: 👍 🙏 😊 ✅ 👌 🤝 or any single emoji
- A read receipt or "on it" type reply
- A broadcast/forwarded message not directed at the AI
- A message that clearly closes a resolved topic with nothing new asked

### Respond ONLY if the message is:
- A direct question (contains "?" or implies one)
- An explicit request or command: "send", "check", "remind", "find", "book",
  "show", "help", "what", "how", "when", "who", "why", "get", "do"
- New information requiring action or follow-up
- A task clearly directed at the AI

**When in doubt — stay silent. Less replies, not more.**
```

---

## Add to Agent Config (OpenClaw / LangChain / similar)

For OpenClaw, place in `SOUL.md`. For LangChain/LlamaIndex, inject as the first block of the system message. For simple `messages[]` APIs, prepend to the `system` role content.

---

## What Counts as IGNORE — Extended List

| Category | Examples |
|----------|---------|
| Acks | ok, okay, k, fine, sure, noted, received, understood, got it, will do |
| Thanks | thanks, thank you, thx, ty, thank u |
| Status | seen, read, on it, checking |
| Single emoji | 👍 🙏 😊 ✅ 👌 🤝 ❤️ 🔥 💯 |
| Filler | hmm, hm, ah, oh, ohh, yep, yup, yes (no follow-up) |
| Closed topics | Any message that ends a completed thread with nothing new asked |

---

## Conversation Context Companion Rule

Pair the intent gate with a context rule so replies that DO go through are aware of history:

```markdown
## ⚡ STEP 2 — USE CONVERSATION HISTORY

Always read the last 10–15 messages from the same sender before replying.
- Reference prior context — never restart cold
- If a topic was already resolved, don't repeat it
- Track conversation state: pending?, already replied?, mid-thread?
```

---

## Example Domains

| Platform | How to Apply |
|----------|-------------|
| WhatsApp bot (OpenClaw, Baileys) | Add to SOUL.md as Step 1 |
| Telegram bot | System message prepend |
| Slack bot | System prompt first block |
| Discord bot | Before persona instructions |
| Customer support chatbot | Before escalation logic |
| Any LLM with tool use | Before tool-calling instructions |
