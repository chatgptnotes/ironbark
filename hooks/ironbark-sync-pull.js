#!/usr/bin/env node
'use strict';
const path = require('path');
const { log, output } = require(path.join(__dirname, '..', 'lib', 'utils'));
function run(rawInput) {
  try {
    const { pull } = require(path.join(__dirname, '..', 'lib', 'sync'));
    const isSessionStart = !rawInput || rawInput.includes('"SessionStart"') || rawInput.includes('session_id');
    const result = pull(isSessionStart);
    if (result.pulled > 0) {
      const msg = '[Ironbark Sync] Pulled ' + result.pulled + ' skill(s) from community repo';
      log(msg); output(msg);
    }
  } catch (err) { log('[Ironbark Sync] Pull hook error: ' + err.message); }
  return rawInput || '';
}
module.exports = { run };
if (require.main === module) { const r = run(process.argv[2] || ''); if (r) process.stdout.write(r); }
