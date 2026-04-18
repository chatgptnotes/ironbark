---
name: stateful-cli-as-http-service
description: Wrap a stateful or interactive CLI (claude, gh copilot, REPL tools) as an HTTP service. Covers the subset of CLI-bridge problems the plain cloud-to-vps-http-bridge skill does not — single-flight busy lock, ANSI stripping, SIGTERM→SIGKILL timeout escalation, safe JSON parse with regex fallback, and timing-safe key compare without crypto.timingSafeEqual.
source_project: Ai-aas/nexaproc-ai-gateway
projects_used_in: [Ai-aas]
tags: [node, typescript, express, cli-wrapper, claude-cli, child_process, spawn, ansi, pm2, aiaas, bridge]
harvested_from_session: 2026-04-18
---

# Stateful CLI as HTTP Service

## Scope

Extends [`cloud-to-vps-http-bridge`](../cloud-to-vps-http-bridge/SKILL.md). That skill already covers nginx reverse proxy, PM2, API-key auth, VPS rsync deploy. **This skill is only the delta** for wrapping a *stateful or interactive* CLI instead of a stateless one like a shell command.

Use this when the CLI:
- Holds session/auth state per-process (e.g. `claude`, `gh copilot`, `openclaw`, `aider`).
- Cannot safely run two invocations in parallel from the same working directory.
- Emits ANSI color codes even when stdout is piped.
- Sometimes prints a prelude (banners, auth hints) before the JSON you want.

## The Five Patterns

### 1. Single-flight busy lock

A boolean flag on the bridge object. Reject overlapping calls with a typed error → HTTP `429`. Do **not** queue — queueing masks client bugs and grows unbounded.

```ts
export class BridgeBusyError extends Error {
  constructor() { super('Bridge is currently busy.'); this.name = 'BridgeBusyError'; }
}

export class ClaudeBridge {
  private busy = false;

  async invoke(prompt: string, opts: BridgeOptions = {}): Promise<BridgeResult> {
    if (this.busy) throw new BridgeBusyError();
    this.busy = true;
    try {
      return await this.spawnAndCapture(prompt, opts);
    } finally {
      this.busy = false;
    }
  }
}
```

Route the error in the Express error handler:

```ts
if (err instanceof BridgeBusyError) return res.status(429).json({ ok: false, error: err.message });
```

Why 429 not 503: the server is healthy, the specific resource is busy. Clients retry with backoff.

### 2. SIGTERM → 2s grace → SIGKILL timeout escalation

`child.kill()` alone sends `SIGTERM` but doesn't guarantee exit. Interactive CLIs that trap signals (to clean up sessions) can hang. Escalate:

```ts
const timer = setTimeout(() => {
  timedOut = true;
  try {
    child.kill('SIGTERM');
    setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 2_000).unref();
  } catch { /* already exited */ }
}, timeoutMs);
timer.unref();
```

The inner `.unref()` is important — without it, a pending kill-timer keeps the event loop alive after a clean exit.

Also hard-cap the user-supplied timeout so a bad client can't wedge a request for an hour:

```ts
const timeoutMs =
  typeof body.timeoutMs === 'number' && body.timeoutMs > 0 && body.timeoutMs <= 120_000
    ? body.timeoutMs : undefined;
```

Map timeout to HTTP `504`, not `500`.

### 3. ANSI stripping is not optional

CLIs designed for humans emit color codes even when `stdout` is piped — piping detection is unreliable. `strip-ansi` once, at the bridge boundary, before anything else touches the buffer:

```ts
import stripAnsi from 'strip-ansi';

const cleanStdout = stripAnsi(result.stdout);
const cleanStderr = stripAnsi(result.stderr);
```

Do this **before** JSON parsing. A single stray `\x1b[0m` breaks `JSON.parse`.

Note: `strip-ansi` v6 is CJS-friendly; v7+ is ESM-only. If your project is CommonJS, pin `strip-ansi@^6`.

### 4. Safe JSON parse with regex fallback

Even with ANSI stripped, some CLIs prepend a banner or auth notice before JSON output. Try `JSON.parse` first, then fall back to extracting the first `{…}` or `[…]` block:

```ts
private safeJsonParse(input: string): unknown {
  try { return JSON.parse(input); } catch { /* fall through */ }
  const match = input.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) return undefined;
  try { return JSON.parse(match[0]); } catch { return undefined; }
}
```

Return `undefined` (not throw) on failure — the caller still gets raw `stdout` and can decide.

The greedy `[\s\S]*` is deliberate: it matches the outermost braces. For most single-object CLI outputs this is correct. If the CLI emits multiple JSON objects, return `raw` and let the caller split.

### 5. Timing-safe key compare without `crypto.timingSafeEqual`

`crypto.timingSafeEqual` **throws** on mismatched buffer lengths. That length-check itself leaks the key length, and the throw becomes a bug waiting to happen the first time a client sends the wrong size. A manual compare avoids both:

```ts
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
```

Length leak is acceptable here because the master-key length is a deployment constant, not a secret. Enforce a minimum length at startup so a misconfigured deploy refuses to boot rather than running insecurely:

```ts
export function authMiddleware(masterKey: string) {
  if (!masterKey || masterKey.length < 16) {
    throw new Error('MASTER_KEY must be set and at least 16 chars. Refusing to start.');
  }
  return (req, res, next) => { /* ... */ };
}
```

The `throw` happens during middleware construction, before `app.listen()` — the process exits non-zero and PM2 shows it as errored, which is the behavior you want.

## Spawn options that matter

```ts
spawn(this.claudeBin, ['-p', prompt], {
  cwd: opts.cwd ?? process.cwd(),
  env: process.env,
  shell: false,        // never true — arg injection surface
  windowsHide: true,   // suppress console window flash on Win VPS
});
```

- **`shell: false`** is non-negotiable when any arg is user-supplied. `spawn` with `shell: true` re-parses args through the shell; a payload like `"; rm -rf /"` becomes exploitable. Passing args as an array with `shell: false` is safe.
- **Pass prompt via `-p` arg, not stdin.** stdin-mode CLIs often wait for EOF or interactive prompts and will hang.
- **Inherit `process.env`** so the CLI sees `HOME`, `PATH`, auth env vars (`ANTHROPIC_API_KEY`) etc. Don't pass `env: {}`.

## Request-path skeleton

```
POST /api/invoke
  │  X-Nexaproc-Key header  → timing-safe compare
  ▼
Template registry (taskID → render(payload) → prompt string)
  ▼
ClaudeBridge.invoke(prompt, { useJson, timeoutMs })
  │  busy? → 429
  ▼
spawn(claudeBin, ['-p', prompt, ...jsonFlags])
  │  timeout → SIGTERM → 2s grace → SIGKILL → 504
  ▼
stripAnsi(stdout) → optional safeJsonParse → JSON response
```

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Client sees `429 Busy` on first call | Previous call still running (timeout too low, or CLI hung) | Raise `CLAUDE_TIMEOUT_MS`; verify the CLI exits cleanly on stdin close |
| `JSON.parse` fails despite `useJson: true` | ANSI not stripped, or CLI prepended a banner | Confirm `strip-ansi` applied; use `safeJsonParse` with regex fallback |
| Process lingers after timeout | CLI trapped SIGTERM | 2s grace + SIGKILL escalation, or add `detached: true` + kill the process group |
| Server exits on boot | `MASTER_KEY` missing/short | Intentional — set a ≥16-char key in `.env` |
| `EAGAIN` / `ENOMEM` under load | Unbounded concurrent spawns from multiple bridge instances | Keep one bridge per process; use PM2 `instances: 1` for this service |
| Colors in stdout break downstream clients | Client piping the JSON response somewhere that parses ANSI | Always strip at the server boundary, never rely on client stripping |

## When NOT to use this pattern

- **Stateless CLIs** (`curl`, `jq`, `ffmpeg` one-shots): the plain bridge pattern is enough; busy-lock is pure overhead.
- **High-throughput workloads**: single-flight caps you at one concurrent job per process. If you need N parallel, run N PM2 instances with a round-robin proxy — but each must have its own isolated `cwd` and session state.
- **CLIs with a native SDK or HTTP API**: use the SDK. Shelling out to a CLI is a last resort for tools that have no library form (`claude` CLI, `gh copilot`, `aider`).

## Related skills

- [`cloud-to-vps-http-bridge`](../cloud-to-vps-http-bridge/SKILL.md) — base bridge pattern (nginx, PM2, API-key auth).
- [`claude-vps-ssh-access`](../claude-vps-ssh-access/SKILL.md) — running the Claude CLI on a VPS under a headless account.
- [`pm2-cluster-scada-pitfall`](../pm2-cluster-scada-pitfall/SKILL.md) — why `instances: 1` matters for stateful processes.
