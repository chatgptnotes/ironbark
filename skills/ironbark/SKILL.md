---
name: ironbark
description: "Hermes-style learning loop — harvests skills from sessions, auto-syncs with chatgptnotes/ironbark community repo."
origin: ECC
version: 2.0.0
---

# Ironbark — Self-Improving Learning Loop

Harvests reusable skills from complex sessions and shares them via `chatgptnotes/ironbark`.

## Community Repo

**All skills auto-sync with `github.com/chatgptnotes/ironbark`**

| Direction | When | Hook |
|-----------|------|------|
| **Pull** | Session start + mid-session (stale >30min) | `ironbark-sync-pull.js` |
| **Push** | After `/ironbark` harvests | `ironbark-sync-push.js` (automatic) |

## How It Works

1. **SessionStart** — auto-bootstrap CLAUDE.md + pull community skills
2. **Mid-session** — PreToolUse pull if stale >30min
3. **Session nudge** — suggests `/ironbark` after 15+ tool calls
4. **Harvest** — `/ironbark` reviews session, creates generic SKILL.md files
5. **Auto-push** — Stop hook pushes new skills to `chatgptnotes/ironbark`

## Generalization Rule

All skills MUST use generic, domain-neutral terminology with Example Domains tables.

## Configuration

- **Repo**: `chatgptnotes/ironbark` (hardcoded in `lib/sync.js`)
- **Pull staleness**: 30 minutes
- **Push cooldown**: 5 minutes
- **Nudge threshold**: 15 tool calls
