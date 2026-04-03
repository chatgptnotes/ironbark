#!/usr/bin/env node
/**
 * Ironbark Auto-Nudge — Stop Hook
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Runs after each Claude response. Counts tool_use entries in the transcript.
 * When the count exceeds the threshold (15), nudges the user to run /ironbark.
 * Uses a flag file to avoid repeated nudges in the same session.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { getSessionIdShort, countInFile, log } = require('../lib/utils');

const TOOL_CALL_THRESHOLD = 15;

function getNudgeFlagPath() {
  return path.join(os.tmpdir(), `ironbark-nudged-${getSessionIdShort('default')}`);
}

function alreadyNudged() {
  return fs.existsSync(getNudgeFlagPath());
}

function markNudged() {
  try { fs.writeFileSync(getNudgeFlagPath(), new Date().toISOString(), 'utf8'); } catch { /* non-critical */ }
}

// Fast-require path (used by ECC's run-with-flags.js)
function run(rawInput) {
  if (alreadyNudged()) return rawInput || '';

  let transcriptPath = null;
  try {
    const input = JSON.parse(rawInput || '{}');
    transcriptPath = input.transcript_path;
  } catch {
    transcriptPath = process.env.CLAUDE_TRANSCRIPT_PATH;
  }

  if (!transcriptPath || !fs.existsSync(transcriptPath)) return rawInput || '';

  const toolCallCount = countInFile(transcriptPath, /"type"\s*:\s*"tool_use"/g);
  if (toolCallCount < TOOL_CALL_THRESHOLD) return rawInput || '';

  markNudged();
  log(`[Ironbark] Session has ${toolCallCount} tool calls — complex session detected`);

  return `[Ironbark] This session used ${toolCallCount} tool calls with potentially harvestable patterns. Consider running /ironbark to extract reusable skills before ending the session.`;
}

module.exports = { run };

// Legacy stdin path (standalone execution)
if (require.main === module) {
  const MAX_STDIN = 1024 * 1024;
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { if (data.length < MAX_STDIN) data += chunk.substring(0, MAX_STDIN - data.length); });
  process.stdin.on('end', () => {
    const result = run(data);
    if (result) process.stdout.write(result);
    process.exit(0);
  });
}
