---
name: Plan File Versioned Evolution
description: How to evolve a committed roadmap document incrementally via targeted Edit calls, version-bump footers, and commit messages that explain WHY — so git log preserves the decision history.
source_project: nexaproc
projects_used_in: [nexaproc]
tags: [documentation, planning, git, roadmap, change-management, versioning, decision-log]
harvested: 2026-04-11
---

# Plan File Versioned Evolution

When a committed roadmap or design doc needs to evolve as decisions are made, resist the urge to rewrite it wholesale. Instead, treat it like code: targeted edits, version footer bump, commit message that explains the WHY. Git log becomes an auditable decision log.

## When to Use

- Any long-lived planning document (roadmap, RFC, architecture decision record) that lives in git
- When stakeholders need to see WHY a decision changed, not just that it did
- When you're evolving a plan across multiple conversations or sprints
- When the plan file is both the spec AND the changelog
- When you would otherwise feel tempted to "just rewrite the whole doc"

## The evolution loop

```
v1.0 — initial plan
  → stakeholder feedback or new constraint
v1.1 — targeted Edit: add §2.1, update 2–3 related lines, bump footer
  → git commit "docs(plan): add two-stage vision cascade per new constraint X"
  → git push

  → new security review
v1.2 — targeted Edit: add §3.2.1 decision table, update §6 cross-cutting row, bump footer
  → git commit "docs(plan): harden PdM-22 data access via read-only DB role"
  → git push

  → new live test findings
v1.3 — targeted Edit: rewrite §9 as "Resolved Questions", add inline finding table, bump footer
  → git commit "docs(plan): security review of Q3–Q6 + Week 1 prerequisites"
  → git push
```

Each commit is one thematic change. The footer version (e.g. `Plan v1.3`) is a stable anchor anyone can grep for to find "what was the plan as-of decision X".

## The pattern in detail

### 1. Pin a version footer from day 1

Every plan file ends with a line like:

```markdown
---

*drmhope.com | A Bettroi Product | Plan v1.0 | Generated 2026-04-11*
```

The version is the contract. Every revision bumps it and appends a revision note.

### 2. Use `Edit` (or per-file replace), not `Write`

`Write` overwrites — loses history and invites "big bang" rewrites. `Edit` forces you to identify the specific old_string and replacement, which:

- Catches collisions (old_string is not unique → you're editing the wrong section)
- Preserves unrelated content byte-for-byte
- Keeps `git diff` small and readable

```ts
// GOOD: targeted edit
Edit({
  file: 'PLAN.md',
  old_string: '*drmhope.com | Plan v1.2 | Generated 2026-04-11 · Revised 2026-04-11 with X*',
  new_string: '*drmhope.com | Plan v1.3 | Generated 2026-04-11 · Revised 2026-04-11 with X, Y, Z*'
})

// BAD: rewrite the whole file from memory
Write({ file: 'PLAN.md', content: '...entire 400-line plan...' })
```

### 3. One commit per thematic change

Not one commit per file edit. One commit per decision. If a decision touches 5 places in the plan, that's one commit with 5 edits.

```
# This session's timeline
380fc8e docs: add AI modules implementation plan (NexaProc v2.1–2.3)  ← v1.0 initial
fec730d docs(ai-plan): two-stage vision pipeline (Gemini 2.5 Pro + Claude Opus 4.6)  ← v1.1
e367415 docs(ai-plan): harden PdM-22 data access via read-only DB role  ← v1.2
95c8c54 docs(ai-plan): security review of Q3–Q6 + Week 1 IDOR prerequisites  ← v1.3
```

Each is grep-able, revert-able, and explains itself.

### 4. Commit message explains WHY, not WHAT

Bad:
```
docs: update plan
```

Also bad:
```
docs: add §2.1, update §3.1 QC-01 row, update §6 cost-control, update §9 Q1
```

Good:
```
docs(ai-plan): two-stage vision pipeline (Gemini 2.5 Pro + Claude Opus 4.6)

Replaces the "Gemini + OpenCV.js fallback" design with a confidence-
based escalation cascade. Every image is scored by Gemini 2.5 Pro
(primary, ~$1.25/1M tok, already wired). When primary confidence
is below 0.7 or Zod schema parse fails, re-run through Claude Opus 4.6
(~$15/1M tok) for a second opinion.

Both SDKs already installed — no new deps beyond sharp.

ONNX/self-hosted YOLO deferred to P2 after AiFeedback collects
>=1k labelled samples. Budget: $150/mo ceiling = ~50k inspections
(85% Gemini-only, 15% escalated to Opus).

Resolves open question #1 in §9.
```

The body answers: what changed, what was rejected and why, what's still open, what's the quantitative justification. Six months later, someone reverts this commit — the message tells them exactly what's at stake.

### 5. Resolved Questions > Open Questions

Don't delete open questions when they're resolved. Rewrite the section as "Resolved Questions" and preserve each question with its original number, struck through, and the decision inline:

```markdown
## 9 · Resolved Questions (after review YYYY-MM-DD)

### 9.S1 — Vision inference location
~~Open.~~ **Resolved:** Two-stage cascade (see §2.1). Both SDKs already installed.
Self-hosted YOLO deferred to P2.

### 9.S3 — Customer pilot anchor
~~Which plant + which module anchors v2.1?~~

**Blocker:** four existing IDOR findings must be fixed first.

| Finding | Severity | Source | Blocks |
|---|---|---|---|
| FINDING-001 (Screen IDOR) | HIGH | BA 2026-04-08 | HMI demos |
| NEW: alarm controller IDOR | HIGH | grep 2026-04-11 | Copilot RAG |

**Decision:** Use synthetic data for v2.1 demo; fix IDORs in Week 1.
```

The struck-through original keeps the question visible so future readers understand what was being asked. The inline decision shows what was answered.

### 6. Include evidence tables, not just prose

When a decision is based on findings or live tests, embed the evidence as a table:

```markdown
**Live security check (2026-04-11):**
- ✓ `/api/ai/generate-plant-image` returns HTTP 401 without JWT
- ✓ Postgres port 5432 externally FILTERED
- ⚠ Gap: nginx rate limit is per-IP, not per-user
```

Future-you trusts a table with checkmarks and dates more than "we tested this, it's fine".

### 7. Cross-references over duplication

When §3.3 depends on a decision in §3.2.1, write "See §3.2.1 for rationale" instead of copy-pasting. Keeps the doc DRY. If the decision changes, there's one place to update.

### 8. Footer format as structured metadata

```markdown
*drmhope.com | A Bettroi Product | Plan v1.3 | Generated 2026-04-11 · Revised 2026-04-11 with (a) two-stage vision pipeline, (b) PdM-22 read-only DB role hardening, (c) Q3–Q6 security review — four IDOR fixes added as Week 1 prerequisites*
```

- `v1.3` — grep-able version anchor
- Generated date — original
- Revised date — most recent change (same date is fine, timestamp if you need granularity)
- List of revision themes — shows the evolution at a glance without reading commit history

## Pitfalls

1. **Semver temptation.** Don't try to map semver to planning. Use `v1.0, v1.1, v1.2` as an ordered log, not a compatibility contract. `v2.0` would signal a complete rewrite — use it sparingly.
2. **Merge conflicts on the footer.** If two PRs both bump the footer, the merger will hit a conflict. Resolve by combining the revision lists and incrementing to the next version.
3. **Forgetting cross-references when you split a section.** If you promote something from a row to a new subsection, update every `See §X` reference. Use `grep -n '§3\.2' PLAN.md` to find them.
4. **Over-editing.** Not every typo fix needs a version bump. Reserve version bumps for substantive decisions. Typos can ride on the next real revision.
5. **Editing without committing.** If you make a revision but don't commit, git log doesn't reflect it. Commit every version bump immediately, even if the doc stays uncommitted until reviewed — at least the working copy diff is bounded.
6. **Rewriting resolved decisions silently.** If a resolved decision changes, DON'T edit the resolution in place. Append a note: `**Update 2026-05-01:** after new data from pilot, reverting to option B. See §9.S1-update.`

## Tooling

- `git log --oneline -- PLAN.md` — see every revision
- `git log -p -S 'v1.2' PLAN.md` — find the commit that introduced a version
- `git show HEAD:PLAN.md | grep '^## '` — table of contents at a given commit
- `git diff v1.2..v1.3 -- PLAN.md` — see what a specific version bump changed (tag versions if needed)

## Related skills

- `rollback-policy-pattern` — when revision is a retraction
- `multi-tenant-audit-checklist` — example of a document that benefits from versioned evolution
- `no-mock-data-in-production` — rationale that should land in a plan's commit message body
