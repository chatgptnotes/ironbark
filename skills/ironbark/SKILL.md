---
name: ironbark
description: "Hermes-style learning loop — harvests skills from sessions, auto-syncs with chatgptnotes/ironbark community repo every 30 minutes."
origin: ECC
version: 2.1.0
---

# Ironbark — Self-Improving Learning Loop

Harvests reusable skills from complex sessions and shares them via `chatgptnotes/ironbark`. All skills sync bidirectionally on a 30-minute interval, regardless of whether Claude Code is running.

## Community Repo

**All skills auto-sync with `github.com/chatgptnotes/ironbark`**

| Direction | When | Trigger |
|-----------|------|---------|
| **Pull** | Session start + mid-session (stale >30min) | `ironbark-sync-pull.js` hook |
| **Push** | After `/ironbark` harvests | `ironbark-sync-push.js` hook (flag-gated) |
| **Pull + Push** | Every 30 minutes, background | `lib/sync-cli.js` via cron / Windows Task Scheduler |

## How It Works

1. **SessionStart** — auto-bootstrap CLAUDE.md + pull community skills
2. **Mid-session** — PreToolUse pull if stale >30min
3. **Session nudge** — suggests `/ironbark` after 15+ tool calls
4. **Harvest** — `/ironbark` reviews session, creates generic SKILL.md files
5. **Auto-push (event)** — Stop hook pushes new skills to `chatgptnotes/ironbark`
6. **Background sync (scheduled)** — every 30 min, the OS scheduler runs `sync-cli.js` which pulls any new community skills and pushes any local harvested skills that aren't upstream yet. Works even if Claude Code is closed.

## Generalization Rule

All skills MUST use generic, domain-neutral terminology with Example Domains tables.

## Configuration

- **Repo**: `chatgptnotes/ironbark` (hardcoded in `lib/sync.js`)
- **Pull staleness**: 30 minutes
- **Scheduled interval**: 30 minutes (cron `*/30 * * * *` or Windows scheduled task `IronbarkSync`)
- **Push cooldown**: 5 minutes
- **Nudge threshold**: 15 tool calls
- **Commit identity**: uses your `git config user.name/email` if set, otherwise falls back to `ironbark-sync (<username>) <username@hostname.ironbark.local>`
- **Opt-out**: set `IRONBARK_SYNC_DISABLED=1` in your environment to disable all sync (hooks and scheduled task become no-ops)
