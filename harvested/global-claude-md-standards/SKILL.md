---
name: Global CLAUDE.md — Auto-Loaded Coding Standards
description: Create ~/.claude/CLAUDE.md to inject coding rules, forbidden patterns, and workflow protocols into every Claude Code session automatically — no manual pasting, no per-project setup required.
type: pattern
tags: [claude-code, claude-md, coding-standards, global-rules, automation, workflow]
---

# Global CLAUDE.md — Auto-Loaded Coding Standards

## Problem

You have rules you want Claude Code to follow on every project — no hardcoding, no mock data, specific workflow order, security rules. But:
- You forget to paste them at session start
- Per-project CLAUDE.md gets stale or missing
- New projects start without any guardrails

## Solution

`~/.claude/CLAUDE.md` is loaded by Claude Code at the start of **every session, every project**, globally. Put your non-negotiable rules here once — they apply everywhere automatically.

---

## Setup

```bash
# Create the global file
touch ~/.claude/CLAUDE.md
```

Then edit it with your rules. Claude Code picks it up on the next session start — no restart needed.

---

## Recommended Structure

```markdown
# Global Claude Code Rules — [Your Name]

These rules apply to EVERY project, EVERY session, automatically.

---

## ⚡ Core Workflow Protocol

[Your mandatory build order / integration protocol]

---

## 🚫 Always-Forbidden Patterns

- Never hardcode mock data in components that display live data
- Never commit .env files
- Never push directly to main
- Never use `any` in TypeScript without a comment explaining why

---

## 🔁 Default Workflow for Any New Feature

[Step-by-step order you want followed]

---

## Code Quality Rules

- try/catch on every external call (DB, API, WebSocket, LLM)
- Log failures — never swallow errors silently
- Every new function needs a 1-line comment
- No console.log in production code

---

## Project Context (global)

- Your name, timezone, active projects
- VPS SSH command, primary repos, preferred tools
```

---

## Hierarchy — Three Levels of CLAUDE.md

```
~/.claude/CLAUDE.md              ← GLOBAL: applies to every session
  ↓ merged with
<project>/.claude/CLAUDE.md     ← PROJECT: project-specific additions
  OR
<project>/CLAUDE.md             ← PROJECT: same effect, root of repo
```

Rules from all levels are merged. Project-level can add to or override global rules.

---

## What to Put in Global vs Project

| Rule Type | Global | Project |
|-----------|--------|---------|
| No hardcoding / no mock data | ✅ | |
| Security rules (.env, no main push) | ✅ | |
| Preferred workflow order | ✅ | |
| Tech stack versions | | ✅ |
| Database schema conventions | | ✅ |
| Team lead names, contacts | | ✅ |
| Project-specific API endpoints | | ✅ |

---

## Anti-Patterns to Avoid

- Don't duplicate rules between global and project — global wins, project adds
- Don't put secrets in CLAUDE.md — it may be committed to repos
- Don't make it too long — Claude Code has a context window; keep global rules under ~100 lines
- Don't mix project state (current sprint, open bugs) into global — that goes in project CLAUDE.md

---

## Example Domains

| Team | What to Put in Global CLAUDE.md |
|------|--------------------------------|
| SCADA / HMI | Zero-hardcode protocol, no mock tags, real polling only |
| Web apps | No placeholder data, Supabase key rules, branch policy |
| AI/ML | No hallucinated results in UI, always show confidence |
| Mobile | No hardcoded API URLs, environment-based config only |
| Any team | Security rules, git workflow, code quality baseline |
