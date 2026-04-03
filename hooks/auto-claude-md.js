#!/usr/bin/env node
/**
 * Ironbark Auto-Bootstrap — SessionStart Hook
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Runs on session start. Checks for CLAUDE.md in the project directory:
 *   Case A: No CLAUDE.md → creates one tailored to detected stack with Ironbark section
 *   Case B: CLAUDE.md exists without Ironbark → appends Ironbark section
 *   Case C: CLAUDE.md exists with Ironbark → does nothing
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { detectProjectType } = require('../lib/project-detect');
const { getProjectName, log, output } = require('../lib/utils');

const IRONBARK_MARKER = '## Ironbark';

const IRONBARK_SECTION = `
## Ironbark

This project uses automatic skill harvesting powered by the Ironbark learning loop.

- **Auto-harvest**: After complex sessions (15+ tool calls), you'll be nudged to run \`/ironbark\`
- **Manual harvest**: Run \`/ironbark\` at any time to extract reusable patterns from the current session
- **Cross-project**: Skills are saved to \`~/.claude/skills/harvested/\` and shared across all projects
- **What gets harvested**: Non-trivial approaches, trial-and-error discoveries, debugging patterns, integration quirks
- **Existing skills**: \`/learn\`, \`/learn-eval\`, and instincts continue working alongside Ironbark
`;

function generateTemplate(projectInfo, projectName) {
  const { languages, frameworks, primary } = projectInfo;
  const langList = languages.length > 0 ? languages.join(', ') : 'unknown';
  const fwList = frameworks.length > 0 ? frameworks.join(', ') : 'none detected';

  let testingSection = '';
  let codeStyleSection = '';

  if (languages.includes('python')) {
    testingSection = `- Test framework: pytest\n- Run tests: \`pytest\`\n- Coverage: \`pytest --cov\``;
    codeStyleSection = `- Linter: ruff or flake8\n- Formatter: black or ruff format\n- Type checking: mypy or pyright`;
  } else if (languages.includes('typescript') || languages.includes('javascript')) {
    testingSection = `- Test framework: vitest or jest\n- Run tests: \`npm test\`\n- Coverage: \`npm run test -- --coverage\``;
    codeStyleSection = `- Linter: ESLint\n- Formatter: Prettier\n- Type checking: tsc --noEmit`;
  } else if (languages.includes('golang')) {
    testingSection = `- Test framework: go test\n- Run tests: \`go test ./...\`\n- Coverage: \`go test -cover ./...\``;
    codeStyleSection = `- Linter: golangci-lint\n- Formatter: gofmt / goimports`;
  } else if (languages.includes('rust')) {
    testingSection = `- Test framework: cargo test\n- Run tests: \`cargo test\`\n- Coverage: \`cargo llvm-cov\``;
    codeStyleSection = `- Linter: clippy\n- Formatter: rustfmt`;
  } else if (languages.includes('java') || languages.includes('kotlin')) {
    testingSection = `- Test framework: JUnit 5\n- Run tests: \`./gradlew test\` or \`mvn test\`\n- Coverage: JaCoCo`;
    codeStyleSection = `- Linter: Checkstyle or ktlint\n- Formatter: google-java-format or ktfmt`;
  } else {
    testingSection = `- Add testing framework appropriate for this project`;
    codeStyleSection = `- Add linter and formatter appropriate for this project`;
  }

  return `# ${projectName}

## Project Overview

**Languages:** ${langList}
**Frameworks:** ${fwList}
**Primary:** ${primary}

## Code Style

${codeStyleSection}

## Testing

${testingSection}

## Security

- No hardcoded secrets — use environment variables
- Validate all user inputs
- Parameterized queries for database access
${IRONBARK_SECTION}`;
}

// --- Entry points ---

// Fast-require path (used by ECC's run-with-flags.js)
function run(rawInput) {
  execute();
  return rawInput || '';
}

// Legacy stdin path (standalone execution)
function execute() {
  const projectDir = process.cwd();
  const claudeMdPath = path.join(projectDir, 'CLAUDE.md');
  const projectName = getProjectName() || path.basename(projectDir);

  // Skip home directory
  const homeDir = require('os').homedir();
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

  if (fs.existsSync(claudeMdPath)) {
    let content;
    try { content = fs.readFileSync(claudeMdPath, 'utf8'); } catch (err) {
      log(`[Ironbark] Failed to read CLAUDE.md: ${err.message}`);
      return;
    }

    if (content.includes(IRONBARK_MARKER) || content.toLowerCase().includes('ironbark')) {
      log('[Ironbark] CLAUDE.md already has Ironbark section');
      return;
    }

    // Case B: Append Ironbark section
    try {
      fs.appendFileSync(claudeMdPath, '\n' + IRONBARK_SECTION);
      log('[Ironbark] Added Ironbark section to existing CLAUDE.md');
      output(`[Ironbark] Added Ironbark learning loop to existing CLAUDE.md for "${projectName}"`);
    } catch (err) {
      log(`[Ironbark] Failed to append: ${err.message}`);
    }
  } else {
    // Case A: Create new CLAUDE.md
    try {
      const template = generateTemplate(projectInfo, projectName);
      fs.writeFileSync(claudeMdPath, template, 'utf8');
      log(`[Ironbark] Created CLAUDE.md for "${projectName}"`);
      output(`[Ironbark] Created CLAUDE.md with Ironbark learning loop for "${projectName}" (${projectInfo.languages.join(', ') || 'unknown stack'})`);
    } catch (err) {
      log(`[Ironbark] Failed to create CLAUDE.md: ${err.message}`);
    }
  }
}

module.exports = { run };

// Allow standalone execution: node auto-claude-md.js
if (require.main === module) {
  execute();
}
