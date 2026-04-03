/**
 * Ironbark — Minimal cross-platform utilities
 * Standalone version (no ECC dependency)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const isWindows = process.platform === 'win32';

function getHomeDir() {
  return os.homedir();
}

function getClaudeDir() {
  return path.join(getHomeDir(), '.claude');
}

function getHarvestedSkillsDir() {
  return path.join(getClaudeDir(), 'skills', 'harvested');
}

function ensureDir(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  } catch (err) {
    if (err.code !== 'EEXIST') {
      throw new Error(`Failed to create directory '${dirPath}': ${err.message}`);
    }
  }
  return dirPath;
}

function getDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getProjectName() {
  try {
    const result = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000
    }).trim();
    return path.basename(result);
  } catch {
    return path.basename(process.cwd()) || null;
  }
}

function getSessionIdShort(fallback = 'default') {
  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (sessionId && sessionId.length > 0) {
    return sessionId.slice(-8);
  }
  return getProjectName() || fallback;
}

/**
 * Count regex matches in a file (streaming, memory-safe)
 */
function countInFile(filePath, regex) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const matches = content.match(regex);
    return matches ? matches.length : 0;
  } catch {
    return 0;
  }
}

/** Write to stderr (not visible to Claude) */
function log(message) {
  console.error(message);
}

/** Write to stdout (returned to Claude) */
function output(data) {
  if (typeof data === 'object') {
    console.log(JSON.stringify(data));
  } else {
    console.log(data);
  }
}

module.exports = {
  isWindows,
  getHomeDir,
  getClaudeDir,
  getHarvestedSkillsDir,
  ensureDir,
  getDateString,
  getProjectName,
  getSessionIdShort,
  countInFile,
  log,
  output
};
