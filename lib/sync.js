#!/usr/bin/env node
/**
 * Ironbark Sync Engine
 *
 * Handles bi-directional sync between local harvested skills and the
 * shared Ironbark git repo (chatgptnotes/ironbark).
 *
 * Pull: repo → local (~/.claude/skills/harvested/)
 * Push: local → repo (auto-commit + push)
 *
 * The repo URL is hardcoded — anyone installing Ironbark automatically
 * syncs with the same shared skill repository.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
const { log } = require('./utils');

const REPO_URL = 'https://github.com/chatgptnotes/ironbark.git';
const REPO_OWNER = 'chatgptnotes';
const REPO_NAME = 'ironbark';
const REPO_DIR = path.join(os.homedir(), '.claude', 'ironbark-repo');
const LOCAL_SKILLS_DIR = path.join(os.homedir(), '.claude', 'skills', 'harvested');
const REPO_SKILLS_DIR = path.join(REPO_DIR, 'harvested');
const PULL_STALENESS_MS = 30 * 60 * 1000;
const LAST_PULL_FILE = path.join(os.tmpdir(), 'ironbark-last-pull');
const SYNC_LOCK_FILE = path.join(os.tmpdir(), 'ironbark-sync.lock');
const SYNC_LOCK_MAX_AGE_MS = 10 * 60 * 1000; // stale after 10 min

function isSyncDisabled() {
  return process.env.IRONBARK_SYNC_DISABLED === '1';
}

/**
 * Build a commit identity. Prefers the user's own `git config` values (so
 * commits are attributable), falls back to a bot-style identity derived from
 * the OS user + hostname.
 */
function getCommitIdentity() {
  const cfgName = exec('git config user.name', { cwd: REPO_DIR });
  const cfgEmail = exec('git config user.email', { cwd: REPO_DIR });
  if (cfgName && cfgEmail) {
    return { name: cfgName, email: cfgEmail };
  }
  const username = (os.userInfo().username || 'user').replace(/[^A-Za-z0-9._-]/g, '');
  const hostname = (os.hostname() || 'host').replace(/[^A-Za-z0-9._-]/g, '');
  return {
    name: 'ironbark-sync (' + username + ')',
    email: username + '@' + hostname + '.ironbark.local'
  };
}

function escapeForShell(s) {
  // Quote for use inside double-quoted shell args on both sh and cmd.
  return String(s).replace(/"/g, '\\"');
}

function exec(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', timeout: 30000, ...opts }).trim();
  } catch (err) {
    log('[Ironbark Sync] Command failed: ' + cmd + ' — ' + err.message);
    return null;
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function ensureRepoCloned() {
  if (fs.existsSync(path.join(REPO_DIR, '.git'))) return true;
  log('[Ironbark Sync] Cloning shared repo...');
  const result = exec('git clone "' + REPO_URL + '" "' + REPO_DIR + '"');
  if (result === null) { log('[Ironbark Sync] Clone failed'); return false; }
  return true;
}

function shouldPull() {
  try {
    if (!fs.existsSync(LAST_PULL_FILE)) return true;
    const lastPull = parseInt(fs.readFileSync(LAST_PULL_FILE, 'utf8'), 10);
    return Date.now() - lastPull > PULL_STALENESS_MS;
  } catch { return true; }
}

function markPulled() {
  try { fs.writeFileSync(LAST_PULL_FILE, String(Date.now()), 'utf8'); } catch {}
}

function pull(force) {
  const result = { pulled: 0, errors: [] };
  if (isSyncDisabled()) return result;
  if (!force && !shouldPull()) return result;
  if (!ensureRepoCloned()) { result.errors.push('Could not clone repo'); return result; }

  exec('git pull --ff-only', { cwd: REPO_DIR });
  markPulled();

  if (!fs.existsSync(REPO_SKILLS_DIR)) return result;
  ensureDir(LOCAL_SKILLS_DIR);

  try {
    const repoSkills = fs.readdirSync(REPO_SKILLS_DIR).filter(
      f => f !== '.gitkeep' && fs.statSync(path.join(REPO_SKILLS_DIR, f)).isDirectory()
    );
    for (const skillDir of repoSkills) {
      const src = path.join(REPO_SKILLS_DIR, skillDir, 'SKILL.md');
      const destDir = path.join(LOCAL_SKILLS_DIR, skillDir);
      const dest = path.join(destDir, 'SKILL.md');
      if (!fs.existsSync(src)) continue;
      let shouldCopy = !fs.existsSync(dest);
      if (!shouldCopy) shouldCopy = fs.statSync(src).mtimeMs > fs.statSync(dest).mtimeMs;
      if (shouldCopy) {
        ensureDir(destDir);
        fs.copyFileSync(src, dest);
        result.pulled++;
      }
    }
  } catch (err) { result.errors.push(err.message); }
  log('[Ironbark Sync] Pull complete: ' + result.pulled + ' skills updated');
  return result;
}

function push() {
  const result = { pushed: 0, errors: [] };
  if (isSyncDisabled()) return result;
  if (!ensureRepoCloned()) { result.errors.push('Could not clone repo'); return result; }

  exec('git pull --ff-only', { cwd: REPO_DIR });
  ensureDir(REPO_SKILLS_DIR);
  ensureDir(LOCAL_SKILLS_DIR);

  try {
    const localSkills = fs.readdirSync(LOCAL_SKILLS_DIR).filter(
      f => fs.statSync(path.join(LOCAL_SKILLS_DIR, f)).isDirectory()
    );
    for (const skillDir of localSkills) {
      const src = path.join(LOCAL_SKILLS_DIR, skillDir, 'SKILL.md');
      const destDir = path.join(REPO_SKILLS_DIR, skillDir);
      const dest = path.join(destDir, 'SKILL.md');
      if (!fs.existsSync(src)) continue;
      let shouldCopy = !fs.existsSync(dest);
      if (!shouldCopy) shouldCopy = fs.statSync(src).mtimeMs > fs.statSync(dest).mtimeMs;
      if (shouldCopy) {
        ensureDir(destDir);
        fs.copyFileSync(src, dest);
        result.pushed++;
      }
    }
    if (result.pushed === 0) return result;

    exec('git add harvested/', { cwd: REPO_DIR });
    const hostname = os.hostname();
    const username = os.userInfo().username;
    const timestamp = new Date().toISOString().split('T')[0];
    const msg = 'chore: sync ' + result.pushed + ' skill(s) from ' + username + '@' + hostname + ' [' + timestamp + ']';
    const id = getCommitIdentity();
    const commitCmd = 'git -c user.name="' + escapeForShell(id.name) + '" ' +
                      '-c user.email="' + escapeForShell(id.email) + '" ' +
                      'commit -m "' + escapeForShell(msg) + '"';
    exec(commitCmd, { cwd: REPO_DIR });
    const pushResult = exec('git push', { cwd: REPO_DIR });
    if (pushResult === null) {
      result.errors.push('Push failed — check credentials');
      exec('git reset --soft HEAD~1', { cwd: REPO_DIR });
    }
  } catch (err) { result.errors.push(err.message); }
  return result;
}

/**
 * Full bidirectional sync, invoked by the OS-level scheduler (cron / Task
 * Scheduler) every 30 minutes via lib/sync-cli.js. Unlike the hook-driven
 * push() which only fires when the PUSH_FLAG is set by the /ironbark command,
 * this pushes any local changes found on disk regardless of the flag.
 *
 * Uses a lock file in the system temp dir to prevent concurrent runs if a
 * sync is slow and the next interval fires.
 *
 * Honors IRONBARK_SYNC_DISABLED=1 as an opt-out switch.
 */
function runScheduled() {
  if (isSyncDisabled()) {
    return { disabled: true, pulled: 0, pushed: 0, errors: [] };
  }

  // Stale-lock handling: remove and continue if older than SYNC_LOCK_MAX_AGE_MS
  try {
    if (fs.existsSync(SYNC_LOCK_FILE)) {
      const lockAge = Date.now() - fs.statSync(SYNC_LOCK_FILE).mtimeMs;
      if (lockAge < SYNC_LOCK_MAX_AGE_MS) {
        log('[Ironbark Sync] Lock held for ' + Math.round(lockAge / 1000) + 's, skipping');
        return { locked: true, pulled: 0, pushed: 0, errors: [] };
      }
      log('[Ironbark Sync] Stale lock removed (' + Math.round(lockAge / 1000) + 's old)');
      try { fs.unlinkSync(SYNC_LOCK_FILE); } catch {}
    }
    fs.writeFileSync(SYNC_LOCK_FILE, String(process.pid), 'utf8');
  } catch (err) {
    log('[Ironbark Sync] Lock file error: ' + err.message);
  }

  const combined = { pulled: 0, pushed: 0, errors: [] };

  try {
    const pullResult = pull(true); // force pull regardless of staleness
    combined.pulled = pullResult.pulled || 0;
    combined.errors = combined.errors.concat(pullResult.errors || []);

    const pushResult = push();
    combined.pushed = pushResult.pushed || 0;
    combined.errors = combined.errors.concat(pushResult.errors || []);

    log('[Ironbark Sync] Scheduled sync done: +' + combined.pulled +
        ' pulled, ' + combined.pushed + ' pushed, ' + combined.errors.length + ' error(s)');
  } catch (err) {
    combined.errors.push('runScheduled: ' + err.message);
  } finally {
    try { fs.unlinkSync(SYNC_LOCK_FILE); } catch {}
  }

  return combined;
}

module.exports = {
  pull,
  push,
  runScheduled,
  shouldPull,
  ensureRepoCloned,
  isSyncDisabled,
  getCommitIdentity,
  REPO_URL,
  REPO_DIR,
  LOCAL_SKILLS_DIR,
  REPO_SKILLS_DIR
};
