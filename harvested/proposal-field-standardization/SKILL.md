# Proposal Field Standardization via CLAUDE.md

## Skill Metadata
```yaml
name: Proposal Field Standardization via CLAUDE.md
description: Keep sender email, company name, address, and other boilerplate fields in a single CLAUDE.md source of truth so all proposal documents stay consistent — change once, applies everywhere
version: 1.0.0
tags: [proposals, documents, standardization, claude-md, templates]
```

## Problem

When generating multiple client-facing documents (proposals, invoices, covering letters), boilerplate fields like sender email, company name, address, and signatory can diverge across files. Updating one document doesn't update the others, creating inconsistent or outdated contact details in live documents.

## Solution

Store all canonical sender fields in the project's `CLAUDE.md` under a clearly labelled section. Every time a document is generated, Claude reads those values from `CLAUDE.md` — the document never hard-codes them independently.

### CLAUDE.md Pattern

```markdown
## Company Details

- **Company:** Acme Corp Ltd
- **Registration:** REG-12345 | Regulatory Authority Name
- **Address:** Unit 1, Business Park, City, Country
- **Email:** admin@acme.com | **Website:** acme.com | **Tel:** +1 555 000 0000
- **Signatory:** Jane Smith, CEO & Principal Consultant
```

### When a Field Changes

1. Update the value in `CLAUDE.md` only
2. Re-generate all affected documents from their HTML sources
3. Never search-and-replace across individual HTML files — that is the symptom of missing standardization

### For Existing Documents That Used the Old Value

When a field like email changes, update:
1. `CLAUDE.md` (the source of truth)
2. The HTML source file(s) using `replace_all: true` in Edit
3. Re-generate PDFs from the updated HTML

## Example Domains

| Domain | Fields to standardize |
|--------|-----------------------|
| Consulting / professional services | Email, company name, signatory, trade license, address |
| SaaS / product companies | Support email, company legal name, registered address |
| Freelancers | Personal email, trading name, bank/payment details |
| Law firms / accountants | Partner name, firm registration, professional body number |
| Healthcare providers | Clinic name, license number, responsible clinician |

## What NOT to Put in CLAUDE.md

- Client-specific details (client name, project ref, date) — these vary per document
- Pricing — changes per engagement
- Scope — changes per project

## Anti-patterns

- Hard-coding `bk@bettroi.com` in 12 HTML files when `admin@bettroi.com` is the canonical address
- Using find-and-replace across documents after a field change — error-prone and incomplete
- Storing boilerplate only in the most recent document and copying it manually to new ones

## Key Rule

**One field, one source. CLAUDE.md holds the canonical value. Documents read from it. Never let the same boilerplate field diverge across multiple documents.**
