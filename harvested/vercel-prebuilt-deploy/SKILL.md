---
name: Vercel Prebuilt Deploy Workaround
description: When Vercel remote builds fail silently (empty error message), build locally with vercel build --prod then deploy with vercel deploy --prebuilt --prod
source_project: ampris-1
projects_used_in: [ampris-1]
tags: [vercel, deployment, monorepo, vite, pnpm]
harvested: 2026-04-04
---

# Vercel Prebuilt Deploy Workaround

## Problem

Vercel remote builds can fail silently with:
```json
{
  "status": "error",
  "reason": "deploy_failed",
  "message": ""
}
```

Common causes in monorepos:
- `.claude/worktrees/` or agent worktree directories confusing the build
- pnpm workspace resolution issues in Vercel's build environment
- Submodule references that Vercel can't resolve
- `.vercelignore` being too aggressive or too permissive

## Solution: Local Build + Prebuilt Deploy

### Step 1: Build locally for production target

```bash
vercel build --prod
```

This runs the full Vercel build pipeline locally (installs deps, runs build command, generates `.vercel/output/`). The `--prod` flag is critical — without it, the output targets "preview" and can't be deployed to production.

### Step 2: Deploy the prebuilt output

```bash
vercel deploy --prebuilt --prod
```

This uploads the `.vercel/output/` directory directly without triggering a remote build.

### Common Pitfall: Target Mismatch

```
Error: The "--prebuilt" option was used with the target environment "production",
but the prebuilt output found in ".vercel/output" was built with target environment "preview".
```

Fix: Always use `vercel build --prod` (not just `vercel build`) when targeting production.

## .vercelignore Tips for Monorepos

When `.vercelignore` is needed:
```
# Exclude agent worktrees and heavy directories
.claude/
apps/server/
apps/electron/
prisma/
scripts/
docker-compose*.yml
Dockerfile*
```

**Do NOT exclude:**
- `packages/` — workspace dependencies needed at build time
- `*.md` — can accidentally match needed files in subdirectories
- `pnpm-lock.yaml` — needed for dependency resolution

**When in doubt:** Remove `.vercelignore` entirely and let `.gitignore` handle exclusions. If builds still fail, use the prebuilt deploy pattern.

## When to Apply

- Monorepo with pnpm workspaces on Vercel
- Projects with git worktrees or submodules
- Any time `vercel --prod` fails with empty error messages
- CI/CD pipelines where you want deterministic builds
