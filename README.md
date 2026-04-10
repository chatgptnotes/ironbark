# Ironbark

**A self-improving learning loop for Claude Code** — inspired by [Hermes Agent](https://github.com/NousResearch/hermes-agent)'s skill creation system.

Ironbark automatically bootstraps projects, harvests reusable skills from complex sessions, and shares them across all your projects.

## What It Does

```
Session Start
  └── Auto-creates CLAUDE.md (or injects Ironbark section into existing one)

During Work
  └── After 15+ tool calls, nudges you to run /ironbark

/ironbark Command
  └── Reviews entire session → extracts multiple skills → deduplicates → saves

Cross-Project
  └── Skills from Project A are automatically available in Project B
```

### The Learning Loop

1. **You work** on a complex task — debugging, trial-and-error, integration quirks
2. **Ironbark detects** complexity (15+ tool calls) and nudges you
3. **You run `/ironbark`** — it reviews the entire session and identifies harvestable patterns
4. **Skills are created** as structured SKILL.md files with:
   - When to activate (trigger conditions)
   - The problem solved
   - The solution (with code examples)
   - What was tried and failed (experiential learning)
5. **Next session** in any project — those skills are available automatically

## Installation

### Prerequisites

- [Claude Code](https://claude.ai/code) (CLI, VS Code, or JetBrains)
- Node.js 18+ (already installed with Claude Code)

### Quick Install

```bash
git clone https://github.com/chatgptnotes/ironbark.git
cd ironbark

# macOS / Linux / Git Bash on Windows
bash install.sh

# Windows PowerShell
powershell -ExecutionPolicy Bypass -File install.ps1
```

### What Gets Installed

| File | Location | Purpose |
|------|----------|---------|
| `/ironbark` command | `~/.claude/commands/ironbark.md` | Manual skill harvesting |
| Ironbark skill | `~/.claude/skills/ironbark/SKILL.md` | Teaches Claude about Ironbark |
| Auto-bootstrap hook | `~/.claude/ironbark/hooks/auto-claude-md.js` | Creates CLAUDE.md on session start |
| Auto-nudge hook | `~/.claude/ironbark/hooks/ironbark-auto.js` | Nudges after complex sessions |
| Bundled libs | `~/.claude/ironbark/lib/` | Project detection, utilities |
| Harvested skills | `~/.claude/skills/harvested/` | Cross-project skill storage |

## Usage

### Automatic (No Action Needed)

1. Open any project in Claude Code (VS Code, CLI, etc.)
2. If no `CLAUDE.md` exists, one is created with your stack detected
3. If `CLAUDE.md` exists but has no Ironbark section, it gets appended
4. After complex work (15+ tool calls), you'll see:
   ```
   [Ironbark] This session used 23 tool calls with potentially harvestable patterns.
   Consider running /ironbark to extract reusable skills.
   ```

### Manual

Run `/ironbark` at any point during a session to harvest skills:

```
/ironbark
```

This will:
1. Review the entire conversation
2. Identify non-trivial patterns (debugging discoveries, integration quirks, etc.)
3. Deduplicate against existing skills
4. Show you a summary table
5. Save confirmed skills to `~/.claude/skills/harvested/`

### Harvested Skill Format

```yaml
---
name: prisma-migration-rollback
description: "Safe rollback pattern for failed Prisma migrations using shadow database"
origin: ironbark
harvested: 2026-04-03
source_project: "nexaproc"
version: 1.0.0
tags: [prisma, postgres, migrations]
projects_used_in:
  - nexaproc
---

# Prisma Migration Rollback

## When to Activate
When a Prisma migration fails and needs to be rolled back safely.

## Problem
Failed migrations can leave the database in an inconsistent state...

## Solution
Use the shadow database approach with `prisma migrate resolve`...

## What Was Tried (Failed)
- Direct `prisma migrate reset` — destroyed production data
- Manual SQL rollback — missed generated indexes

## Example
...
```

## Community Sync

Ironbark auto-syncs harvested skills with the shared community repo at [`chatgptnotes/ironbark`](https://github.com/chatgptnotes/ironbark). Any skill you harvest becomes available to every other Ironbark user on their next sync, and vice versa.

### Three sync paths (all run automatically)

| Path | When | What it does |
|------|------|--------------|
| **SessionStart hook** | Every Claude Code session start | Pulls new community skills |
| **Stop hook** | After `/ironbark` harvests a skill | Pushes the new skill |
| **30-minute scheduled sync** | Every 30 min, in the background | Full bidirectional pull + push, even if Claude Code is closed |

The background sync is registered during installation:
- **macOS / Linux**: cron entry `*/30 * * * * node ~/.claude/ironbark/lib/sync-cli.js`
- **Windows**: Scheduled Task `IronbarkSync` running `node.exe sync-cli.js` every 30 minutes

### How it works under the hood

1. A full clone of `chatgptnotes/ironbark` lives at `~/.claude/ironbark-repo/`
2. Your local harvested skills live at `~/.claude/skills/harvested/`
3. Sync copies files bidirectionally between the two directories using mtime (newest wins), then commits and pushes any local additions
4. A lock file at `$TMPDIR/ironbark-sync.lock` prevents concurrent syncs from stepping on each other

### Commit identity

Pushes use your real `git config user.name` / `user.email` if set, so skills you contribute are properly attributed. If no git config exists, a fallback identity `ironbark-sync (<username>) <username@hostname.ironbark.local>` is used instead.

### Opt out

Set the environment variable to disable all sync (hooks and scheduled task will become no-ops):

```bash
# macOS / Linux
export IRONBARK_SYNC_DISABLED=1

# Windows (persistent)
setx IRONBARK_SYNC_DISABLED 1
```

### Security note

Pulled skills come from other users and are loaded into Claude's context on your next session. Only install Ironbark from sources you trust, and review new community skills periodically at [`chatgptnotes/ironbark/harvested`](https://github.com/chatgptnotes/ironbark/tree/master/harvested).

## How It Differs From Existing Learning Systems

| System | Granularity | Trigger | Output |
|--------|------------|---------|--------|
| `/learn` | Single pattern | Manual | `skills/learned/*.md` |
| `/learn-eval` | Single pattern + quality gate | Manual | `skills/learned/*.md` |
| Instincts (v2.1) | Atomic micro-behavior | Auto (hooks) | `homunculus/instincts/` |
| **Ironbark** | **Multiple full skills** | **Manual + auto-nudge** | **`skills/harvested/*/SKILL.md`** |

Ironbark doesn't replace existing systems — it complements them. Instincts capture micro-patterns; `/learn` captures single patterns; **Ironbark harvests full, structured skills from entire sessions**.

## Uninstall

```bash
bash uninstall.sh
```

This removes hooks and Ironbark files but preserves your harvested skills in `~/.claude/skills/harvested/`.

## Requirements

- Claude Code (any platform: CLI, VS Code, JetBrains, Desktop)
- Node.js 18+
- No other dependencies (self-contained, zero npm packages)

## License

MIT
