---
name: Multi-Channel Alert Gateway
description: BaseChannel abstraction + severity-based routing + parallel delivery via Promise.allSettled + retry + delivery tracking table
source_project: HazPredict-1
projects_used_in: [HazPredict-1]
tags: [nodejs, express, notifications, alerts, multi-channel, promise-allSettled]
harvested: 2026-04-04
---

# Multi-Channel Alert Gateway

Pattern for dispatching notifications across multiple channels (SMS, WhatsApp, Email, Push, Webhook) with severity-based routing, parallel delivery, retry logic, and delivery tracking.

## When to Use

- Building any multi-channel notification/alert system
- Need severity-based routing (critical → all channels, low → email only)
- Want delivery tracking and audit trail
- Need graceful degradation when channels fail

## Architecture

```
Alert Trigger
  → Severity Router (maps severity level → eligible channels)
  → Config Lookup (which recipients for this entity?)
  → Filter (intersect eligible channels with configured channels)
  → Promise.allSettled (parallel dispatch to all)
    → sendWithRetry (1 retry after 2s delay)
      → BaseChannel.send() (channel-specific adapter)
  → trackDelivery (non-blocking write to audit table)
```

## Key Pattern: BaseChannel Abstraction

```javascript
class BaseChannel {
  constructor(name) {
    this.name = name;
    this.log = logger.child({ channel: name });
  }

  /** @returns {boolean} Whether required env vars / credentials are set */
  isConfigured() {
    throw new Error(`${this.name}: isConfigured() not implemented`);
  }

  /**
   * @param {object} payload - Standardized notification payload
   * @returns {Promise<{success: boolean, messageId?: string, stub?: boolean, error?: string}>}
   */
  async send(payload) {
    throw new Error(`${this.name}: send() not implemented`);
  }

  /** Override for platform-specific formatting (WhatsApp rich text, SMS short, etc.) */
  formatMessage(payload) {
    return `[${payload.severity}] ${payload.source}: ${payload.message}`;
  }
}
```

Each channel extends BaseChannel and implements `isConfigured()` and `send()`. When `isConfigured()` returns false, the channel returns `{ success: true, stub: true }` — logs that it would have sent, without failing.

## Key Pattern: Severity-Based Routing

```javascript
const SEVERITY_CHANNELS = {
  CRITICAL: ["sms", "whatsapp", "email", "push"],
  HIGH:     ["sms", "email", "push"],
  MEDIUM:   ["email", "push"],
  LOW:      ["email"],
};
```

The eligible channels are intersected with the actual notification configs from the database, so only configured recipients receive alerts.

## Key Pattern: Parallel Dispatch with Promise.allSettled

```javascript
const results = await Promise.allSettled(
  eligibleConfigs.map(async (cfg) => {
    const result = await sendWithRetry(cfg.channel, channelPayload);
    // Non-blocking delivery tracking
    if (alertId) trackDelivery(alertId, cfg.channel, cfg.destination, result);
    return { channel: cfg.channel, ...result };
  })
);
```

**Why `Promise.allSettled` instead of `Promise.all`**: One channel failing (e.g., SMS provider down) must NOT prevent other channels from delivering. `allSettled` runs all to completion.

## Key Pattern: Single Retry with Delay

```javascript
async function sendWithRetry(channel, payload) {
  try {
    return await adapter.send(payload);
  } catch (err) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    try {
      return await adapter.send(payload);
    } catch (retryErr) {
      return { success: false, error: retryErr.message };
    }
  }
}
```

One retry is enough for transient network errors. More retries belong in a queue system, not in the hot path.

## Key Pattern: Delivery Tracking Table

```sql
CREATE TABLE notification_deliveries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_id uuid REFERENCES alerts(id),
  channel text NOT NULL,         -- 'sms' | 'email' | 'push' | 'webhook'
  destination text NOT NULL,     -- phone number, email, or endpoint URL
  status text NOT NULL,          -- 'sent' | 'failed' | 'stub'
  message_id text,               -- provider's message ID for tracing
  error text,                    -- error message on failure
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);
```

Tracking is fire-and-forget (non-blocking). A tracking failure should never block notification dispatch.

## Example Domains

| Domain | Alert Source | Severity Levels | Channels |
|--------|------------|----------------|----------|
| Industrial monitoring | Sensor threshold breach | CRITICAL, HIGH, MEDIUM, LOW | SMS, WhatsApp, Email, Siren |
| E-commerce | Order issue, fraud flag | URGENT, HIGH, NORMAL | SMS, Email, Push, Slack |
| Healthcare | Patient vitals anomaly | STAT, URGENT, ROUTINE | Pager, SMS, Email, In-app |
| DevOps | Infra alert, deploy fail | P1, P2, P3, P4 | PagerDuty, Slack, Email |

## Anti-Patterns to Avoid

1. **Sequential dispatch** — channels must fire in parallel, not one after another
2. **Failing all on one failure** — never use `Promise.all` for multi-channel dispatch
3. **Blocking on tracking** — delivery audit writes must be non-blocking
4. **Hardcoded recipients** — always look up from config table, never embed in code
5. **Silent failures** — always return structured `{success, error}` objects, never swallow errors
