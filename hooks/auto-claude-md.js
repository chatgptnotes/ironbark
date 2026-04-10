#!/usr/bin/env node
/**
 * Ironbark Auto-Bootstrap — SessionStart Hook
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Runs on every Claude Code SessionStart. Ensures the project's CLAUDE.md has
 * a fresh, auto-generated Ironbark section containing a catalog of every
 * harvested skill on this machine, with its name, description, and file path.
 *
 * The catalog is delimited by markers so it can be regenerated on every
 * session without touching any other user content in CLAUDE.md:
 *
 *     <!-- IRONBARK:START - Auto-generated, do not edit -->
 *     ## Ironbark
 *     ...
 *     <!-- IRONBARK:END -->
 *
 * First-run migration: if the project has a legacy plain `## Ironbark`
 * section (pre-sync versions of this script), it is replaced with the new
 * marker-delimited version. Manual content outside those markers is preserved.
 *
 * Before regenerating, this hook calls sync.pull() to refresh the harvested/
 * directory from the community repo (respects the 30-min staleness check, so
 * the network hit is infrequent).
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { detectProjectType } = require('../lib/project-detect');
const { getProjectName, log, output } = require('../lib/utils');

const IRONBARK_START = '<!-- IRONBARK:START - Auto-generated, do not edit -->';
const IRONBARK_END = '<!-- IRONBARK:END -->';
const LEGACY_MARKER = '## Ironbark';
const HARVESTED_DIR = path.join(os.homedir(), '.claude', 'skills', 'harvested');

// Regex to match a marker-delimited block in CLAUDE.md
const MARKER_BLOCK_RE = new RegExp(
  escapeRegex(IRONBARK_START) + '[\\s\\S]*?' + escapeRegex(IRONBARK_END),
  'g'
);

// Regex to match a legacy plain `## Ironbark` section up to the next h1/h2 or EOF
const LEGACY_BLOCK_RE = /\n?## Ironbark\b[\s\S]*?(?=\n## [^#\n]|\n# [^#\n]|$)/;

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse YAML frontmatter from a SKILL.md file. Handles: simple key:value pairs,
 * double/single quoted strings, and flat arrays like [tag1, tag2]. Does NOT
 * handle nested objects — SKILL.md frontmatter is flat.
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};

  const fm = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    let key = m[1];
    let val = m[2].trim();

    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }

    // Parse simple inline array: [a, b, c]
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1)
        .split(',')
        .map(s => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    }

    fm[key] = val;
  }
  return fm;
}

/**
 * Scan ~/.claude/skills/harvested/ and return a sorted list of skill metadata.
 */
function enumerateSkills() {
  const skills = [];
  if (!fs.existsSync(HARVESTED_DIR)) return skills;

  let entries;
  try {
    entries = fs.readdirSync(HARVESTED_DIR);
  } catch {
    return skills;
  }

  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    const skillDir = path.join(HARVESTED_DIR, entry);
    let stat;
    try { stat = fs.statSync(skillDir); } catch { continue; }
    if (!stat.isDirectory()) continue;

    const skillPath = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;

    let content;
    try {
      content = fs.readFileSync(skillPath, 'utf8');
    } catch { continue; }

    const fm = parseFrontmatter(content);
    skills.push({
      name: fm.name || entry,
      description: (typeof fm.description === 'string' ? fm.description : '') || '',
      path: skillPath,
      tags: Array.isArray(fm.tags) ? fm.tags : [],
      source_project: fm.source_project || ''
    });
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

/**
 * Build the auto-generated Ironbark section. Includes a skill catalog table
 * with name, description, and full path to each SKILL.md.
 */
function buildSection(skills) {
  const count = skills.length;
  const lines = [];

  lines.push(IRONBARK_START);
  lines.push('## Ironbark');
  lines.push('');
  lines.push('This project uses the Ironbark learning loop with auto-sync to the community skill repo (`chatgptnotes/ironbark`).');
  lines.push('');
  lines.push('- **Auto-harvest**: After 15+ tool calls, Ironbark nudges you to run `/ironbark`');
  lines.push('- **Manual harvest**: Run `/ironbark` at any time to extract reusable patterns');
  lines.push('- **Background sync**: Every 30 min, `sync-cli.js` pulls new community skills and pushes local ones');
  lines.push('- **Opt-out**: `IRONBARK_SYNC_DISABLED=1`');
  lines.push('');
  lines.push('### Available Harvested Skills (' + count + ')');
  lines.push('');

  if (count === 0) {
    lines.push('*No harvested skills yet. Run `/ironbark` after solving a non-trivial problem to contribute the first one.*');
  } else {
    lines.push('Loaded from `~/.claude/skills/harvested/`. Reference any skill below by name or path when the task matches.');
    lines.push('');
    lines.push('| Skill | Description | Path |');
    lines.push('|-------|-------------|------|');
    for (const s of skills) {
      const name = '`' + s.name + '`';
      const desc = String(s.description).replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 140);
      const pth = '`' + s.path.replace(/\\/g, '/') + '`';
      lines.push('| ' + name + ' | ' + desc + ' | ' + pth + ' |');
    }
  }

  lines.push('');
  lines.push('_Catalog auto-regenerated on every Claude Code session start. Do not edit between the IRONBARK markers, manual edits outside the block are preserved._');
  lines.push('');
  lines.push(IRONBARK_END);

  return lines.join('\n');
}

/**
 * Replace any existing Ironbark block (marker-delimited or legacy plain) in
 * the CLAUDE.md content, or append a fresh one if none exists.
 */
function upsertSection(content, newSection) {
  if (MARKER_BLOCK_RE.test(content)) {
    MARKER_BLOCK_RE.lastIndex = 0;
    return content.replace(MARKER_BLOCK_RE, newSection);
  }

  if (LEGACY_BLOCK_RE.test(content)) {
    return content.replace(LEGACY_BLOCK_RE, '\n\n' + newSection);
  }

  const trimmed = content.replace(/\s+$/, '');
  return trimmed + '\n\n' + newSection + '\n';
}

/**
 * Best-effort pre-update sync. Respects the 30-min staleness check inside
 * pull(), and honors IRONBARK_SYNC_DISABLED. Never blocks session start on a
 * network failure — any error is logged and swallowed.
 */
function refreshSkillsBestEffort() {
  try {
    const { pull } = require(path.join(__dirname, '..', 'lib', 'sync'));
    pull(false);
  } catch (err) {
    log('[Ironbark] Pre-update sync skipped: ' + (err && err.message ? err.message : err));
  }
}

function generateTemplate(projectInfo, projectName, ironbarkSection) {
  const { languages, frameworks, primary } = projectInfo;
  const langList = languages.length > 0 ? languages.join(', ') : 'unknown';
  const fwList = frameworks.length > 0 ? frameworks.join(', ') : 'none detected';

  let testingSection = '';
  let codeStyleSection = '';

  if (languages.includes('python')) {
    testingSection = '- Test framework: pytest\n- Run tests: `pytest`\n- Coverage: `pytest --cov`';
    codeStyleSection = '- Linter: ruff or flake8\n- Formatter: black or ruff format\n- Type checking: mypy or pyright';
  } else if (languages.includes('typescript') || languages.includes('javascript')) {
    testingSection = '- Test framework: vitest or jest\n- Run tests: `npm test`\n- Coverage: `npm run test -- --coverage`';
    codeStyleSection = '- Linter: ESLint\n- Formatter: Prettier\n- Type checking: tsc --noEmit';
  } else if (languages.includes('golang')) {
    testingSection = '- Test framework: go test\n- Run tests: `go test ./...`\n- Coverage: `go test -cover ./...`';
    codeStyleSection = '- Linter: golangci-lint\n- Formatter: gofmt / goimports';
  } else if (languages.includes('rust')) {
    testingSection = '- Test framework: cargo test\n- Run tests: `cargo test`\n- Coverage: `cargo llvm-cov`';
    codeStyleSection = '- Linter: clippy\n- Formatter: rustfmt';
  } else if (languages.includes('java') || languages.includes('kotlin')) {
    testingSection = '- Test framework: JUnit 5\n- Run tests: `./gradlew test` or `mvn test`\n- Coverage: JaCoCo';
    codeStyleSection = '- Linter: Checkstyle or ktlint\n- Formatter: google-java-format or ktfmt';
  } else {
    testingSection = '- Add testing framework appropriate for this project';
    codeStyleSection = '- Add linter and formatter appropriate for this project';
  }

  return '# ' + projectName + '\n\n' +
    '## Project Overview\n\n' +
    '**Languages:** ' + langList + '\n' +
    '**Frameworks:** ' + fwList + '\n' +
    '**Primary:** ' + primary + '\n\n' +
    '## Code Style\n\n' +
    codeStyleSection + '\n\n' +
    '## Testing\n\n' +
    testingSection + '\n\n' +
    '## Security\n\n' +
    '- No hardcoded secrets, use environment variables\n' +
    '- Validate all user inputs\n' +
    '- Parameterized queries for database access\n\n' +
    ironbarkSection + '\n';
}

// --- Entry points ---

// Fast-require path (used by ECC's run-with-flags.js)
function run(rawInput) {
  execute();
  return rawInput || '';
}

function execute() {
  const projectDir = process.cwd();
  const claudeMdPath = path.join(projectDir, 'CLAUDE.md');
  const projectName = getProjectName() || path.basename(projectDir);

  // Skip home directory
  const homeDir = os.homedir();
  if (path.resolve(projectDir) === path.resolve(homeDir)) {
    log('[Ironbark] Skipping home directory');
    return;
  }

  // Skip non-projects
  const hasGit = fs.existsSync(path.join(projectDir, '.git'));
  const projectInfo = detectProjectType(projectDir);
  if (!hasGit && projectInfo.languages.length === 0) {
    log('[Ironbark] No project detected — skipping');
    return;
  }

  // Refresh skills before building the catalog (best-effort, stale-gated)
  refreshSkillsBestEffort();

  const skills = enumerateSkills();
  const newSection = buildSection(skills);

  if (fs.existsSync(claudeMdPath)) {
    let content;
    try {
      content = fs.readFileSync(claudeMdPath, 'utf8');
    } catch (err) {
      log('[Ironbark] Failed to read CLAUDE.md: ' + err.message);
      return;
    }

    const updated = upsertSection(content, newSection);

    if (updated === content) {
      log('[Ironbark] CLAUDE.md skill catalog already current (' + skills.length + ' skills)');
      return;
    }

    try {
      fs.writeFileSync(claudeMdPath, updated, 'utf8');
      const action = MARKER_BLOCK_RE.test(content) ? 'Updated' : 'Added';
      MARKER_BLOCK_RE.lastIndex = 0;
      log('[Ironbark] ' + action + ' skill catalog (' + skills.length + ' skills) in CLAUDE.md');
      output('[Ironbark] ' + action + ' Ironbark skill catalog (' + skills.length + ' skills) in CLAUDE.md for "' + projectName + '"');
    } catch (err) {
      log('[Ironbark] Failed to write CLAUDE.md: ' + err.message);
    }
  } else {
    // Create new CLAUDE.md with Ironbark section included
    try {
      const template = generateTemplate(projectInfo, projectName, newSection);
      fs.writeFileSync(claudeMdPath, template, 'utf8');
      log('[Ironbark] Created CLAUDE.md for "' + projectName + '" with ' + skills.length + ' skills cataloged');
      output('[Ironbark] Created CLAUDE.md with Ironbark learning loop for "' + projectName + '" (' + (projectInfo.languages.join(', ') || 'unknown stack') + ', ' + skills.length + ' skills)');
    } catch (err) {
      log('[Ironbark] Failed to create CLAUDE.md: ' + err.message);
    }
  }
}

module.exports = { run, enumerateSkills, buildSection, upsertSection, parseFrontmatter };

// Allow standalone execution: node auto-claude-md.js
if (require.main === module) {
  execute();
}
