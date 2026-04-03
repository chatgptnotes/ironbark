---
name: Express Rate Limit Hardening
description: Security fixes for express-rate-limit — never trust X-Forwarded-For in keyGenerator, handle IPv6, use validate options
source_project: HazPredict-1
projects_used_in: [HazPredict-1]
tags: [nodejs, express, security, rate-limiting, ipv6, x-forwarded-for]
harvested: 2026-04-03
---

# Express Rate Limit Hardening

Critical security patterns for `express-rate-limit` that prevent bypass attacks. Discovered during a BlackAllert penetration test that found a CRITICAL auth rate limit bypass.

## When to Use

- Any Express app using `express-rate-limit`
- After setting up rate limiting on auth, API, or sensitive endpoints
- During security review of Express middleware

## The Vulnerability: X-Forwarded-For Bypass

### What Went Wrong

```javascript
// VULNERABLE — attacker sends random X-Forwarded-For header per request
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => {
    return req.headers['x-forwarded-for'] || req.ip;  // BYPASS!
  },
});
```

An attacker adds `X-Forwarded-For: <random-ip>` to each request, getting a fresh rate limit bucket every time. Brute force protection becomes useless.

### The Fix

```javascript
// SECURE — use default req.ip which respects Express trust proxy
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  // No custom keyGenerator — default req.ip handles proxy chains correctly
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },  // suppress dev warning
});
```

**Rule: Never read `X-Forwarded-For` directly in a keyGenerator.** Use `req.ip`, which respects Express's `trust proxy` setting and only trusts proxy headers from known proxies.

## IPv6 Handling (ERR_ERL_KEY_GEN_IPV6)

express-rate-limit v7+ warns when the key generator returns an IPv6 address without acknowledging it. On dual-stack servers, `req.ip` may return `::ffff:127.0.0.1`.

### Fix for auth/IP-based limiters

```javascript
validate: { trustProxy: false }
```

### Fix for user-ID-based limiters (e.g., copilot)

When using authenticated user IDs as the primary key with IP fallback:

```javascript
const copilotLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => {
    // Prefer user ID (already validated by JWT middleware)
    if (req.user?.id) return `user:${req.user.id}`;
    // Fall back to req.ip (properly handles IPv6)
    return req.ip;
  },
  validate: { trustProxy: false, keyGeneratorIpFallback: false },
});
```

The `keyGeneratorIpFallback: false` suppresses the IPv6 warning because we're intentionally using a custom key strategy.

## Checklist for Any Express Rate Limiter

- [ ] No custom `keyGenerator` that reads `req.headers['x-forwarded-for']`
- [ ] `trust proxy` set correctly in Express app (`app.set('trust proxy', 1)` behind one proxy)
- [ ] `standardHeaders: true, legacyHeaders: false` (use modern `RateLimit-*` headers)
- [ ] `validate` options set to suppress false-positive warnings in dev
- [ ] Auth endpoints have stricter limits than general API (e.g., 10/15min vs 120/min)
- [ ] SSE/streaming endpoints have appropriate timeout-aware limits

## Common Rate Limit Tiers

| Endpoint Type | Window | Max | Purpose |
|--------------|--------|-----|---------|
| General API | 1 min | 120 | DDoS protection |
| Readings ingestion | 1 min | 30 | Edge device throttle |
| Auth (login/register) | 15 min | 10 | Brute force protection |
| AI/LLM endpoints | 1 min | 10 | Cost protection |
