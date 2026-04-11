---
name: Dual LLM Provider Budget Defense
description: Production budget-burn protection when running two LLM providers — per-user app-layer daily cap (not nginx per-IP), burst detection, provider-level spend alerts, and secrets hygiene.
source_project: nexaproc
projects_used_in: [nexaproc]
tags: [llm, gemini, anthropic, budget, rate-limit, cost-control, security, secrets, middleware, ai-ops]
harvested: 2026-04-11
---

# Dual LLM Provider Budget Defense

A stolen JWT can burn through a month's LLM budget in a single day if your only rate limit is nginx. This skill is the defence-in-depth pattern for production AI features using two providers (e.g. Gemini primary + Claude escalation).

## When to Use

- Production AI features with a monthly $ ceiling on LLM spend
- Any app that uses two providers in a cascade or tool-use pattern
- When nginx or edge-level rate limiting is your only rate limit (it shouldn't be)
- When per-user (not per-IP) abuse is a realistic threat model
- When you handle customer PII and LLM keys are leak-sensitive

## The threat model

1. **Stolen JWT** — attacker exfiltrates a valid user token, burns inferences until billing panics.
2. **Shared NAT fairness failure** — per-IP nginx limits punish all users behind a corporate/coffee-shop NAT when one turns abusive.
3. **Runaway frontend loop** — a UI bug retries a failing inference every 500 ms, costing thousands before anyone notices.
4. **Leaked key** — `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` committed to a frontend bundle, public repo, or error response.

The defences below each target one of these.

## The layered defence

### Layer 1 — Per-user application-layer daily hard cap

nginx rate limiting is **per-IP**, not per-user. It's good for anonymous DoS but useless against stolen JWTs or shared NATs. Enforce in application middleware instead, backed by persistence (not in-memory — memory resets on deploy).

```ts
// server/src/middleware/ai-telemetry.ts
import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from './auth';

const DAILY_CAP = 1000;  // tune per product

export async function aiTelemetryMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const todayCount = await prisma.aiInference.count({
    where: { userId, createdAt: { gte: since } },
  });

  if (todayCount >= DAILY_CAP) {
    res.status(429).json({
      error: 'Daily AI inference limit reached',
      limit: DAILY_CAP,
      resetIn: 'midnight UTC',
    });
    return;
  }

  // Attach remaining budget for the handler to return in headers
  res.locals.aiBudgetRemaining = DAILY_CAP - todayCount;
  next();
}
```

Apply this only to `/api/ai/*` routes, not global:

```ts
// server/src/app.ts
app.use('/api/ai', aiTelemetryMiddleware, aiRoutes);
```

### Layer 2 — Burst detection (anomaly, not hard cap)

A user who normally makes 5/day and suddenly makes 500/hour is compromised or buggy. Don't wait for the daily cap — alert at 5× baseline.

```ts
// Called after successful inference in the middleware post-hook or worker
async function checkBurstAnomaly(userId: string): Promise<void> {
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 3600_000);
  const baselineSince = new Date(now.getTime() - 7 * 86400_000);

  const [hourCount, baselineCount] = await Promise.all([
    prisma.aiInference.count({ where: { userId, createdAt: { gte: hourAgo } } }),
    prisma.aiInference.count({ where: { userId, createdAt: { gte: baselineSince } } }),
  ]);

  const hourlyBaseline = baselineCount / (7 * 24);  // avg per hour

  if (hourlyBaseline >= 1 && hourCount > 5 * hourlyBaseline) {
    await notifySlack({
      channel: '#ops-alerts',
      text: `[AI] Burst anomaly — user=${userId} hourCount=${hourCount} baseline=${hourlyBaseline.toFixed(1)}/h`,
    });
  }
}
```

Fires before the hard cap, while there's still time to investigate.

### Layer 3 — Provider-level spend alerts (defence against your own mistakes)

Your middleware can only protect you if it runs. If a bug bypasses it (wrong route mount, middleware order mistake), the provider dashboard is your last line of defence.

- **Google AI Studio** → Billing → set Budget + email alert at 2/3 of ceiling
- **Anthropic Console** → Usage & billing → set hard monthly limit + email alert
- Same thresholds for both: alert at $100 of a $150 ceiling, hard-stop at $150 (revoke key)

Check these are configured by calling the billing API weekly, not just at setup:

```bash
# Cron weekly — verify alert thresholds still exist
curl -sS "https://generativelanguage.googleapis.com/..." ...
```

### Layer 4 — Secrets hygiene audit

`GEMINI_API_KEY` and `ANTHROPIC_API_KEY` must be server-only env vars. Never:

- In the frontend bundle (`src/**/*`)
- In error responses (the controller's `res.status(500).json({ error: err.message })` can leak stack traces containing the key)
- In logs (structured logger should redact any field matching `/KEY|SECRET|TOKEN/i`)
- In git history (even in deleted commits — use `git log --all -S GEMINI_API_KEY`)

Automated guard:

```bash
# Add to CI / pre-push hook
set -euo pipefail
if git grep -l 'GEMINI_API_KEY\|ANTHROPIC_API_KEY' -- 'src/**' 'public/**' 2>/dev/null; then
  echo "ERROR: LLM API key referenced in frontend code"
  exit 1
fi
```

And in `server/src/config/logger.ts`:

```ts
const redactKeys = (obj: unknown): unknown => {
  if (typeof obj !== 'object' || obj === null) return obj;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (/KEY|SECRET|TOKEN|AUTHORIZATION/i.test(k)) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = redactKeys(v);
    }
  }
  return out;
};
```

### Layer 5 — JWT rotation on suspected leak

If your burst detection or cost anomaly flags a compromise, rotate `JWT_SECRET` immediately. This invalidates every issued token within the refresh window.

```bash
# Rotate and restart — all users re-authenticate
openssl rand -hex 64 > /tmp/new_secret
ssh api.example.com "sed -i 's/^JWT_SECRET=.*/JWT_SECRET=$(cat /tmp/new_secret)/' /root/app/.env && pm2 restart api"
```

Keep `JWT_REFRESH_EXPIRY` short (7 days) to bound blast radius even without a rotation.

## Budget math for planning

For a 2-provider cascade with 15 % escalation rate and $150/month ceiling:

```
Gemini 2.5 Pro:   $1.25 / 1M input tokens, ~256 tok/image tile
  per image:      ~$0.003
Claude Opus 4.6:  $15 / 1M input tokens
  per image:      ~$0.03

Blended per image: 0.85 × $0.003 + 0.15 × $0.03 ≈ $0.007
Monthly at $150 ceiling: ~21,000 inferences
Per-user daily cap of 1000 × 30 days × 500 users = 15M cap headroom
  → ceiling hits before per-user cap for typical usage
```

The per-user cap is there to punish outliers (stolen token), not to enforce the ceiling. The ceiling itself is enforced at the provider level (Layer 3).

## Pitfalls

1. **Middleware order matters.** Put `aiTelemetryMiddleware` AFTER `authenticate` so `req.user` is populated. Put it BEFORE the route handler so the 429 fires before Gemini gets called.
2. **DB count queries every request.** Cache the daily count in Redis with 60 s TTL to avoid hammering Postgres. Invalidate on each new inference.
3. **Race conditions.** Two requests checking "under cap" simultaneously can both succeed, putting the user over. For high-value caps, use a Postgres `UPDATE ... RETURNING` with a check-constraint or a Redis INCR with TTL.
4. **Don't 429 the user silently.** Return `Retry-After` header with midnight UTC timestamp and a clear error message so the frontend can show a friendly message instead of a cryptic failure.
5. **Cost of the cost check.** Counting daily inferences per user costs ~5 ms per request. For high-RPS AI endpoints, this adds up. Redis caching makes it sub-ms.
6. **Per-provider budgets, not just blended.** Gemini can fail → you escalate to Claude → Claude burns budget faster than expected. Track per-provider spend separately so you notice when Gemini is having a bad day.

## Related skills

- `express-rate-limit-hardening` — X-Forwarded-For bypass patterns in the nginx/edge layer
- `llm-vision-confidence-escalation-cascade` — the upstream pattern this defends
- `llm-model-routing` — query-based routing
- `svg-sanitization-dompurify` — another common prompt-injection vector
- `no-mock-data-in-production` — budget abuse is often preceded by a UI bug calling mock endpoints in prod
