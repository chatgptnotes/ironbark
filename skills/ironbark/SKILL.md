---
name: ironbark
description: "Hermes-style learning loop — harvests skills from sessions, auto-syncs with chatgptnotes/ironbark community repo every 30 minutes, and injects a live skill catalog into every project's CLAUDE.md."
origin: ECC
version: 2.2.0
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

1. **SessionStart** — `auto-claude-md.js` calls `sync.pull()`, enumerates all harvested skills, and writes a fresh catalog into the project's `CLAUDE.md` between `<!-- IRONBARK:START -->` and `<!-- IRONBARK:END -->` markers. Content outside the markers is never touched.
2. **Mid-session** — PreToolUse pull if stale >30min
3. **Session nudge** — suggests `/ironbark` after 15+ tool calls
4. **Harvest** — `/ironbark` reviews session, creates generic SKILL.md files
5. **Auto-push (event)** — Stop hook pushes new skills to `chatgptnotes/ironbark`
6. **Background sync (scheduled)** — every 30 min, the OS scheduler runs `sync-cli.js` which pulls any new community skills and pushes any local harvested skills that aren't upstream yet. Works even if Claude Code is closed.

## CLAUDE.md Catalog

On every SessionStart, `auto-claude-md.js` injects a table of every available harvested skill into the project's `CLAUDE.md`:

- **Name** (from frontmatter `name:`)
- **Description** (from frontmatter `description:`)
- **Path** (absolute path to the SKILL.md file)

The table is delimited by `<!-- IRONBARK:START -->` / `<!-- IRONBARK:END -->` markers so it can be safely regenerated without clobbering user edits. Legacy plain `## Ironbark` sections from pre-2.2 versions are auto-migrated on first run.

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
