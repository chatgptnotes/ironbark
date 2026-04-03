---
name: ironbark
description: "Hermes-style learning loop that auto-bootstraps projects with CLAUDE.md, harvests full skills from sessions, and shares them cross-project."
origin: ECC
version: 1.0.0
---

# Ironbark — Self-Improving Learning Loop

A cross-project learning system inspired by Hermes Agent's skill creation loop. Ironbark automatically bootstraps projects, harvests reusable skills from complex sessions, and shares them globally.

## When to Activate

- After a complex session with 15+ tool calls involving trial-and-error or debugging
- When the user solved a non-trivial problem through experimentation
- When the user changed approach mid-task due to experiential findings
- When the Stop hook nudges about harvestable patterns
- When the user explicitly runs `/ironbark`

## How It Works

### 1. Auto-Bootstrap (SessionStart Hook)

Every time a session starts, the `auto-claude-md.js` hook checks:
- **No CLAUDE.md** → creates one tailored to the detected stack with Ironbark enabled
- **CLAUDE.md without Ironbark** → appends the `## Ironbark` section
- **CLAUDE.md with Ironbark** → does nothing

### 2. Session Nudge (Stop Hook)

After each Claude response, `ironbark-auto.js` counts tool calls in the transcript. When the count exceeds 15, it nudges the user to run `/ironbark`.

### 3. Skill Harvesting (/ironbark Command)

The `/ironbark` command reviews the entire session and:
1. Identifies all harvestable patterns (non-trivial approaches, debugging discoveries, integration quirks)
2. Deduplicates against existing skills and instincts
3. Creates or updates full SKILL.md files
4. Asks for user confirmation before saving

### 4. Cross-Project Sharing

All harvested skills go to `~/.claude/skills/harvested/` (global). Each skill's frontmatter tracks:
- `source_project` — where the skill was first discovered
- `projects_used_in` — all projects that have benefited from this skill
- `tags` — language, framework, domain for relevance matching

Skills from Project A are automatically available in Project B.

## Skill Storage

```
~/.claude/skills/harvested/
├── prisma-migration-rollback/
│   └── SKILL.md
├── windows-path-escaping/
│   └── SKILL.md
└── modbus-timeout-handling/
    └── SKILL.md
```

## Relationship to Other Learning Systems

| System | Granularity | Trigger | Output |
|--------|------------|---------|--------|
| `/learn` | Single pattern | Manual | `skills/learned/*.md` |
| `/learn-eval` | Single pattern + quality gate | Manual | `skills/learned/*.md` |
| Instincts (v2.1) | Atomic micro-behavior | Auto (hooks) | `homunculus/instincts/` |
| **Ironbark** | **Multiple full skills** | **Manual + auto-nudge** | **`skills/harvested/*/SKILL.md`** |

Ironbark does NOT replace the other systems — it complements them:
- Instincts capture micro-patterns continuously
- `/learn` captures single patterns on demand
- **Ironbark harvests full, structured skills from entire sessions**

## Proactive Behavior

When you notice a session has involved significant trial-and-error, debugging, or course corrections, suggest running `/ironbark` before the session ends. Frame it as:

> "This session involved some non-trivial problem-solving. Want me to run `/ironbark` to harvest reusable skills from what we learned?"

## Configuration

- **Nudge threshold**: 15 tool calls (configured in `ironbark-auto.js`)
- **Skill storage**: `~/.claude/skills/harvested/` (global, cross-project)
- **CLAUDE.md section**: `## Ironbark` (auto-injected by `auto-claude-md.js`)
