#!/usr/bin/env node
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { log } = require(path.join(__dirname, '..', 'lib', 'utils'));
const PUSH_FLAG = path.join(os.tmpdir(), 'ironbark-push-pending');
const PUSH_COOLDOWN_MS = 5 * 60 * 1000;
function shouldPush() {
  try {
    if (!fs.existsSync(PUSH_FLAG)) return false;
    return Date.now() - parseInt(fs.readFileSync(PUSH_FLAG, 'utf8'), 10) < PUSH_COOLDOWN_MS;
  } catch { return false; }
}
function run(rawInput) {
  try {
    if (!shouldPush()) return rawInput || '';
    const { push } = require(path.join(__dirname, '..', 'lib', 'sync'));
    const result = push();
    if (result.pushed > 0) log('[Ironbark Sync] Auto-pushed ' + result.pushed + ' skill(s)');
    if (result.errors.length > 0) log('[Ironbark Sync] Push errors: ' + result.errors.join(', '));
    try { fs.unlinkSync(PUSH_FLAG); } catch {}
  } catch (err) { log('[Ironbark Sync] Push hook error: ' + err.message); }
  return rawInput || '';
}
module.exports = { run };
if (require.main === module) { const r = run(process.argv[2] || ''); if (r) process.stdout.write(r); }
