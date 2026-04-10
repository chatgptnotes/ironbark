---
description: "Ironbark — Hermes-style learning loop. Harvests reusable SKILL.md files from sessions, auto-syncs with chatgptnotes/ironbark community repo."
allowed_tools: ["Bash", "Read", "Write", "Edit", "Grep", "Glob"]
---

# /ironbark — Harvest Skills from This Session

Review the current session and extract reusable skills. Auto-syncs to `chatgptnotes/ironbark`.

## Workflow

### Phase 1 — Session Review & Candidate Identification

Review conversation history. Identify harvestable patterns:

1. **Non-trivial approach** — required trial and error
2. **Course correction** — changed approach due to experiential findings
3. **Debugging discovery** — non-obvious root cause or fix
4. **Integration quirk** — API behavior, library gotcha, platform workaround

**GENERALIZATION RULE**: All skills MUST use generic terminology. Replace project-specific names:
- `plant_id` → `tenant_id`, `zone` → `resource`, `alarm` → `event`
- Include "Example Domains" table mapping to 3-4 real domains

If nothing worth saving: **"Nothing to harvest."** and stop.

### Phase 2 — Deduplication

1. `Glob` on `~/.claude/skills/harvested/*/SKILL.md` and `~/.claude/skills/learned/*.md`
2. `Grep` for key terms across `~/.claude/skills/`
3. SKIP / UPDATE / CREATE

### Phase 3 — Skill Generation

Create `~/.claude/skills/harvested/<skill-name>/SKILL.md` with generic terminology.

### Phase 4 — Confirmation & Save

Present summary table, ask for confirmation, save.

### Phase 5 — Auto-Sync

After saving, trigger push flag:

```bash
node ~/.claude/ironbark/lib/push-flag.js 2>/dev/null || node ~/.claude/ironbark-repo/lib/push-flag.js 2>/dev/null || true
```

Print: **"Skills will auto-sync to chatgptnotes/ironbark on next response."**

## Quality Criteria

Do NOT harvest: trivial fixes, one-time issues, standard patterns, project-specific-only patterns.
DO harvest: 10+ minute savers, non-obvious solutions, cross-cutting concerns, platform quirks.

## Community Repo

- **Repo**: `github.com/chatgptnotes/ironbark`
- **Pull**: session start + mid-session if stale (>30min)
- **Push**: automatic after harvest (no user command)
- **Background sync**: every 30 minutes via cron / Windows Task Scheduler (`lib/sync-cli.js`) — pulls + pushes regardless of Claude Code being open
- **Conflict**: newer file wins (mtime)
- **Opt-out**: `IRONBARK_SYNC_DISABLED=1`
