---
description: "Ironbark — Hermes-style learning loop. Reviews the entire session and harvests multiple reusable SKILL.md files from non-trivial approaches, trial-and-error discoveries, and experiential findings. Cross-project skill sharing."
allowed_tools: ["Bash", "Read", "Write", "Edit", "Grep", "Glob"]
---

# /ironbark — Harvest Skills from This Session

Review the current session and extract reusable skills using the Hermes-style learning loop.

## Workflow

Execute these phases in order. Stop early if nothing is worth harvesting.

### Phase 1 — Session Review & Candidate Identification

Review the entire conversation history. Identify ALL harvestable patterns using these criteria:

1. **Non-trivial approach** — required trial and error, or multiple attempts
2. **Course correction** — changed approach due to experiential findings
3. **Debugging discovery** — non-obvious root cause or fix
4. **Integration quirk** — API behavior, library gotcha, platform-specific workaround
5. **User expectation mismatch** — user wanted a different method or outcome than initially tried

For each candidate, determine:
- **Skill name** (lowercase-with-hyphens, max 64 chars)
- **Category** (debugging, integration, devops, architecture, performance, security, workflow, etc.)
- **One-line description** (under 130 chars)
- **Create vs Update** — is this a new skill or an improvement to an existing one?

If nothing is worth saving, say **"Nothing to harvest."** and stop.

### Phase 2 — Deduplication

For each candidate:

1. Run `Glob` on `~/.claude/skills/harvested/*/SKILL.md` and `~/.claude/skills/learned/*.md`
2. Run `Grep` for the candidate's key terms across `~/.claude/skills/` and `~/.claude/homunculus/instincts/`
3. Decide:
   - **SKIP** — exact match already exists (log which skill covers it)
   - **UPDATE** — partial overlap with existing skill (will patch/append)
   - **CREATE** — genuinely new pattern

### Phase 3 — Skill Generation

**For CREATE candidates**, create `~/.claude/skills/harvested/<skill-name>/SKILL.md`:

```yaml
---
name: <skill-name>
description: "<Under 130 chars>"
origin: ironbark
harvested: <YYYY-MM-DD>
source_project: "<project name from git remote or directory name>"
version: 1.0.0
tags: [<language>, <framework>, <domain>]
projects_used_in:
  - <current-project-name>
---

# <Skill Title>

## When to Activate

<Specific trigger conditions — what context should cause this skill to fire>

## Problem

<What problem this solves — be specific, not generic>

## Solution

<The approach/technique/pattern — include code examples where applicable>

## What Was Tried (Failed)

<Brief account of wrong approaches that led to discovering this solution.
This is the experiential learning section — capture WHY the obvious approaches didn't work.>

## Example

<Concrete code snippet or command sequence>
```

**For UPDATE candidates**, read the existing SKILL.md and either:
- Append a new subsection under the relevant heading
- Add the current project to `projects_used_in` in frontmatter
- Patch the Solution or Example section with improved content

### Phase 4 — Confirmation & Save

1. Present a summary table:

```
| # | Action | Skill Name           | Path                                          | Reason                              |
|---|--------|----------------------|-----------------------------------------------|--------------------------------------|
| 1 | CREATE | windows-path-escape  | ~/.claude/skills/harvested/windows-path-escape/ | Trial-and-error with path separators |
| 2 | UPDATE | prisma-patterns      | ~/.claude/skills/harvested/prisma-patterns/     | New migration rollback technique     |
| 3 | SKIP   | git-workflow         | ~/.claude/skills/learned/git-workflow.md        | Already covered                      |
```

2. Ask: **"Proceed with these actions? (Y to save all, or specify numbers to skip)"**
3. Save confirmed skills.
4. Print final summary of what was saved/updated.

## Quality Criteria

Do NOT harvest:
- Trivial fixes (typos, simple syntax errors, missing imports)
- One-time issues (specific API outages, temporary environment problems)
- Already well-documented patterns (standard framework usage)
- Patterns that only apply to a single unique situation

DO harvest:
- Patterns that would save 10+ minutes in a future session
- Non-obvious solutions that required investigation
- Cross-cutting concerns that apply to multiple projects
- Platform/environment quirks that are easy to forget

## Notes

- Skills are saved globally at `~/.claude/skills/harvested/` for cross-project sharing
- Each skill tracks `source_project` and `projects_used_in` for lineage
- This command complements `/learn` (single pattern) and instincts (micro-behaviors)
- Run this at the end of complex sessions, or when nudged by the Ironbark Stop hook
