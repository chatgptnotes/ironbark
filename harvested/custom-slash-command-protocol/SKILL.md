---
name: Custom Slash Command — Encode Multi-Step Protocols
description: Create custom Claude Code slash commands in ~/.claude/commands/ that invoke repeatable multi-step workflows with $ARGUMENTS substitution — so any protocol can be triggered with /command-name <target> instead of pasting prompts.
type: pattern
tags: [claude-code, slash-command, workflow, protocol, automation, commands]
---

# Custom Slash Command — Encode Multi-Step Protocols

## Problem

You have a multi-step protocol (integration workflow, code review checklist, security audit, deployment sequence) that you want to invoke consistently. Pasting the full prompt each time is error-prone, inconsistent, and easy to forget.

## Solution

Create a Markdown file in `~/.claude/commands/` — it becomes a slash command available in every Claude Code session. Use `$ARGUMENTS` to pass a target (feature name, file path, module, etc.) at call time.

---

## Setup

```bash
mkdir -p ~/.claude/commands
# Create your command file:
touch ~/.claude/commands/your-command-name.md
```

Command is immediately available as `/your-command-name` in any Claude Code session.

---

## File Format

```markdown
# ~/.claude/commands/zero-hardcode.md

We are starting a new feature: **$ARGUMENTS**

Follow the Zero-Hardcode Protocol strictly. Do not skip steps.

**STEP 1 — Backend + Schema (do this now, nothing else)**
- Create the Prisma model / DB table / API route
- Do NOT touch React, Zustand, or any UI file yet
- Output: schema + service code only

When done, tell me: "Step 1 complete. Run: [exact verification command]"

**STEP 2 — Wait**
I will run the verification. Paste real output before proceeding.

**STEP 3 — Store** (only after Step 2 confirmed)
...

Start with Step 1 now.
```

---

## Usage

```
/zero-hardcode Live PLC Tag Dashboard
/zero-hardcode BNI Contact Status Table  
/zero-hardcode WhatsApp Message History
/security-audit components/PaymentForm.tsx
/deploy-checklist production
```

`$ARGUMENTS` is replaced with everything typed after the command name.

---

## Command File Locations

| Path | Scope |
|------|-------|
| `~/.claude/commands/name.md` | Global — every project |
| `<project>/.claude/commands/name.md` | Project-only |

---

## Anatomy of a Good Command File

```markdown
# Short context sentence with $ARGUMENTS

[What to do — imperative, no hedging]

**STEP 1 — [Name] (do this first, nothing else)**
- Specific instruction
- What NOT to do yet
- Expected output format

"When done, say: '[specific phrase]'"   ← Gate phrase to control pacing

**STEP 2 — [Name] (only after I confirm Step 1)**
...

Start with Step 1 now.   ← End with the trigger
```

Key elements:
- **Gate phrases** — "only after I confirm", "wait for my output" — prevent the AI from skipping ahead
- **Explicit prohibitions** — "Do NOT touch the UI yet" — prevents premature work
- **Expected output format** — tells Claude what a completed step looks like
- **`$ARGUMENTS`** — the target the user names at call time

---

## Multi-Command Pattern — Build a Protocol Library

```
~/.claude/commands/
├── zero-hardcode.md      # /zero-hardcode <feature>
├── security-audit.md     # /security-audit <file>
├── deploy-checklist.md   # /deploy-checklist <env>
├── code-review.md        # /code-review <PR description>
├── db-migration.md       # /db-migration <table change>
└── onboard-intern.md     # /onboard-intern <name>
```

---

## Example Domains

| Use Case | Command |
|----------|---------|
| SCADA feature build | `/zero-hardcode Live Tag HMI Panel` |
| Security review before PR | `/security-audit src/api/auth.ts` |
| Deployment gates | `/deploy-checklist staging` |
| Intern onboarding day | `/onboard-intern Day 2 — Claude SDK` |
| DB schema change | `/db-migration add phone column to contacts` |
| API endpoint design | `/api-design POST /v1/contacts/bulk` |
