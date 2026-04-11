---
name: Timezone-Aware Hourly Cron Fanout
description: Run an hourly cron that uses Intl.DateTimeFormat to check each user's local hour — only deliver to users whose timezone hour matches the target. Works for briefings, reminders, or any per-user scheduled delivery across multiple timezones.
type: pattern
---

# Timezone-Aware Hourly Cron Fanout

## Problem

You want to send per-user scheduled deliveries (briefings, reminders, digests) at a specific local time (e.g. 7 AM for each user), but users are in different timezones. A single daily cron at a fixed UTC time only works for one timezone. Running one cron per timezone is unmaintainable.

## Solution

Run **one cron job every hour** (or every 30 min for finer granularity). On each run, for every user, check whether their local clock hour matches the scheduled delivery hour. Only process users where it matches.

Use `Intl.DateTimeFormat` with `hour: 'numeric', hour12: false` to get the user's current local hour — this is available in all modern runtimes (Node 18+, Edge, Deno) with no extra library.

## Core Pattern

```typescript
/**
 * Returns true if the user's local hour matches their scheduled delivery hour.
 * Called once per user on every hourly cron run.
 *
 * @param scheduledTime - "HH:MM" string from user preferences (e.g. "07:00")
 * @param timezone      - IANA timezone string (e.g. "Asia/Kolkata", "Europe/Berlin")
 */
function isDeliveryDueNow(scheduledTime: string | null, timezone: string | null): boolean {
  if (!scheduledTime) return false;

  const tz = timezone || 'UTC';
  const [hourStr] = scheduledTime.split(':');
  const scheduledHour = parseInt(hourStr, 10);
  if (isNaN(scheduledHour)) return false;

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    });
    const currentHourInTz = parseInt(formatter.format(new Date()), 10);
    return currentHourInTz === scheduledHour;
  } catch {
    // Invalid timezone — fall back to UTC
    console.warn(`[cron] Invalid timezone "${tz}", falling back to UTC`);
    return new Date().getUTCHours() === scheduledHour;
  }
}
```

For **fixed delivery slots** (e.g. always morning/afternoon/evening at 7/13/19), skip storing per-user time and just match against the slot array:

```typescript
const DELIVERY_SLOTS = [
  { label: 'Morning',   hour: 7  },
  { label: 'Afternoon', hour: 13 },
  { label: 'Evening',   hour: 19 },
] as const;

function getActiveSlot(timezone: string): string | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'UTC',
      hour: 'numeric',
      hour12: false,
    });
    const currentHour = parseInt(fmt.format(new Date()), 10);
    return DELIVERY_SLOTS.find(s => s.hour === currentHour)?.label ?? null;
  } catch {
    return null; // silently skip on bad TZ
  }
}
```

## Cron Route Template (Next.js / Vercel)

```typescript
// app/api/cron/your-briefing/route.ts
export const dynamic = 'force-dynamic';
export const maxDuration = 120; // adjust for batch size

export async function GET(req: NextRequest) {
  // 1. Auth — CRON_SECRET prevents unauthorized invocations
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Load users (batch to avoid timeout)
  const { data: users } = await supabaseAdmin
    .from('user_preferences')
    .select('user_id, delivery_time, timezone, channel_value')
    .limit(BATCH_SIZE);

  // 3. Filter to only users due right now
  const due = (users || []).filter(u => isDeliveryDueNow(u.delivery_time, u.timezone));

  // 4. Process each user; never let one failure abort the batch
  let sent = 0;
  for (const user of due) {
    try {
      const content = await generateContentForUser(user.user_id);
      await deliverToUser(user.channel_value, content);
      sent++;
    } catch (err) {
      console.error(`[cron] Failed for user ${user.user_id}:`, err);
    }
  }

  return NextResponse.json({ success: true, due: due.length, sent });
}
```

**vercel.json:**
```json
{
  "crons": [
    { "path": "/api/cron/your-briefing", "schedule": "0 * * * *" }
  ]
}
```

## Key Rules

- **Never abort the batch** — wrap each user's processing in try/catch
- **Always have a TZ fallback** — `Intl.DateTimeFormat` throws on invalid timezone strings; catch and fall back to UTC or a sensible default
- **Batch size matters** — Vercel has a 60-300s function timeout; limit to 20-50 users per run, then add pagination if needed
- **CRON_SECRET auth** — always verify `Authorization: Bearer <CRON_SECRET>`; Vercel also sends this header natively when crons are configured
- **hour12: false** is required — `hour12: true` returns `"7 AM"` which parseInt will parse incorrectly at noon/midnight

## Idempotency Consideration

If you run hourly and a deploy happens mid-run, you may deliver twice in the same hour. Add a `last_delivered_at` column and skip users delivered within the last 50 minutes:

```sql
ALTER TABLE user_preferences ADD COLUMN last_delivered_at timestamptz;
```

```typescript
const fiftyMinsAgo = new Date(Date.now() - 50 * 60 * 1000).toISOString();
const due = (users || []).filter(u =>
  isDeliveryDueNow(u.delivery_time, u.timezone) &&
  (!u.last_delivered_at || u.last_delivered_at < fiftyMinsAgo)
);
```

## Example Domains

| Domain | Scheduled delivery | Timezone source |
|--------|-------------------|-----------------|
| Email briefing SaaS | 7 AM / 1 PM / 7 PM local | `profiles.timezone` |
| News digest | User-configurable "07:30" | `user_preferences.briefing_time` |
| Daily standup reminder | 9 AM local | `team_members.timezone` |
| Medication reminder | Per-prescription time | `prescriptions.reminder_time + patients.timezone` |
| IoT device status report | Business-hours check (9 AM) | `installations.site_timezone` |
