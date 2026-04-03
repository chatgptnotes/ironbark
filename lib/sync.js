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
    exec('git commit -m "' + msg + '"', { cwd: REPO_DIR });
    const pushResult = exec('git push', { cwd: REPO_DIR });
    if (pushResult === null) {
      result.errors.push('Push failed — check credentials');
      exec('git reset --soft HEAD~1', { cwd: REPO_DIR });
    }
  } catch (err) { result.errors.push(err.message); }
  return result;
}

module.exports = { pull, push, shouldPull, ensureRepoCloned, REPO_URL, REPO_DIR, LOCAL_SKILLS_DIR, REPO_SKILLS_DIR };
