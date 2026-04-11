---
name: WhatsApp Instant Acknowledgment Before Slow Processing
description: Send an immediate ack message to the user before kicking off a long-running operation (AI inference, email fetch, DB query). Prevents user timeout frustration and reduces duplicate sends caused by impatient re-sends.
type: pattern
---

# WhatsApp Instant Acknowledgment Before Slow Processing

## Problem

WhatsApp users expect a reply within 2-3 seconds. When your bot does AI inference, fetches emails, or queries a database, that takes 5-30 seconds. The user sees silence and thinks the bot is broken — they re-send the message, causing duplicate processing.

## Solution

Send a short acknowledgment immediately after receiving the message and before starting the actual work. Then send the real reply when ready.

```
User: inbox
Bot:  Checking your emails... Please wait up to 30 seconds.   ← instant ack
Bot:  Here are your 3 unread emails: ...                      ← real reply (after processing)
```

## Core Pattern

```typescript
// In your webhook handler, before the slow operation:

// 1. Send instant ack (non-blocking — don't await in most cases,
//    or await with a short timeout so it doesn't delay processing)
const ack = 'Checking your emails... Please wait up to 30 seconds.';
sendTextMessage(senderPhone, ack); // fire-and-forget OK here

// 2. Now run the slow operation
const result = await fetchEmailsAndSummarize(userId);

// 3. Send the real reply
await sendTextMessage(senderPhone, result);
```

## Skip Ack for Fast Commands

Don't send an ack for commands that respond in <1 second — it creates a confusing double-message experience:

```typescript
const msgLower = messageText.trim().toLowerCase();
const isQuickCommand = ['hi', 'hello', 'help', 'hey', 'menu'].includes(msgLower);
const isOtpCode = /^\d{6}$/.test(messageText.trim());

// Only ack slow operations
if (!isQuickCommand && !isOtpCode) {
  const isHeavyQuery = ['inbox', 'email', 'draft', 'send', 'summarize', 'sabi', 'rfq'].some(
    kw => msgLower.includes(kw)
  );
  if (isHeavyQuery) {
    await sendTextMessage(senderPhone, 'Processing your request... Please wait up to 30 seconds.');
  }
}
```

## Context-Aware Ack Messages

Match the ack to what the user expects the bot to be doing:

```typescript
function getAckMessage(messageText: string): string | null {
  const lower = messageText.toLowerCase();
  if (lower.includes('inbox') || lower.includes('email')) {
    return 'Checking your emails... Please wait up to 30 seconds while I fetch the latest updates.';
  }
  if (lower.includes('draft') || lower.includes('reply')) {
    return 'Writing a draft for you... This takes about 10 seconds.';
  }
  if (['sabi', 'rfq', 'estimation'].some(kw => lower.includes(kw))) {
    return 'Processing your SABI request... Please wait up to 30 seconds.';
  }
  return null; // no ack for quick commands
}

// In webhook:
const ack = getAckMessage(messageText);
if (ack) await sendTextMessage(senderPhone, ack);
```

## Full Webhook Example (Next.js / Vercel)

```typescript
export async function POST(request: NextRequest) {
  const body = await request.json();

  const senderPhone = body.from;
  const messageText = body.message?.text;
  if (!senderPhone || !messageText) {
    return NextResponse.json({ status: 'ignored' });
  }

  // Instant ack — before any slow work
  const ack = getAckMessage(messageText);
  if (ack) {
    // Await here so the ack is delivered before processing starts,
    // but use a tight timeout so a slow delivery API doesn't block us
    await Promise.race([
      sendTextMessage(senderPhone, ack),
      new Promise(resolve => setTimeout(resolve, 2000)), // 2s max wait for ack
    ]);
  }

  // Slow work
  const reply = await processMessage(senderPhone, messageText);

  // Final reply
  await sendTextMessage(senderPhone, reply);
  return NextResponse.json({ status: 'processed' });
}
```

## Rules

- **Ack should be < 500ms** — don't do any DB lookups before sending ack
- **Never ack quick commands** — double-message on "hi" feels broken
- **Be honest about timing** — "up to 30 seconds" sets correct expectations
- **Use `Promise.race` with a timeout** — if your delivery API is slow, don't let the ack delay the actual processing
- **Log ack failures separately** — a failed ack shouldn't abort the real operation

## Applies To

This pattern applies to any channel with low-latency user expectations:
- WhatsApp bots (DoubleTick, Twilio, 360Dialog, OpenClaw)
- Telegram bots (sendChatAction "typing" + message)
- SMS bots (Twilio / Vonage)
- Slack bots (deferred responses with `response_url`)
- Discord slash commands (deferReply, then editReply)

## Example Domains

| Domain | Slow operation | Ack message |
|--------|---------------|-------------|
| Email assistant | Fetch + summarize inbox | "Checking your emails..." |
| Sales bot | CRM lookup + AI draft | "Looking up the account..." |
| Support bot | Knowledge-base RAG query | "Searching our help docs..." |
| IoT dashboard bot | Query time-series DB | "Fetching sensor data..." |
| Legal bot | Document OCR + analysis | "Analyzing the document (may take 30s)..." |
