#!/usr/bin/env node
/**
 * Ironbark Sync CLI
 *
 * Entry point for OS-level schedulers (cron on macOS/Linux, Task Scheduler on
 * Windows). Runs a full bidirectional sync: pulls community skills from the
 * shared repo and pushes any local harvested skills that are newer than the
 * remote copy.
 *
 * Usage (normally invoked by scheduler):
 *   node ~/.claude/ironbark/lib/sync-cli.js
 *
 * Environment:
 *   IRONBARK_SYNC_DISABLED=1  — skip sync (useful on metered networks / CI)
 *
 * Exit codes:
 *   0  — success, disabled, or another sync already in progress
 *   1  — hard error during sync
 */

'use strict';

const path = require('path');

try {
  const { runScheduled } = require(path.join(__dirname, 'sync'));
  const result = runScheduled();

  if (result.disabled) {
    console.error('[Ironbark Sync CLI] Disabled via IRONBARK_SYNC_DISABLED=1');
    process.exit(0);
  }

  if (result.locked) {
    console.error('[Ironbark Sync CLI] Another sync already in progress, skipping');
    process.exit(0);
  }

  const pulled = result.pulled || 0;
  const pushed = result.pushed || 0;
  const errs = (result.errors || []).length;
  console.error('[Ironbark Sync CLI] Done: +' + pulled + ' pulled, ' + pushed + ' pushed, ' + errs + ' error(s)');

  process.exit(errs > 0 ? 1 : 0);
} catch (err) {
  console.error('[Ironbark Sync CLI] Fatal: ' + err.message);
  process.exit(1);
}
