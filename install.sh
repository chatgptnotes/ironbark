#!/usr/bin/env bash
#
# Ironbark Installer
# Installs the Ironbark learning loop into Claude Code
#
# Usage: bash install.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
IRONBARK_DIR="$CLAUDE_DIR/ironbark"

echo "========================================"
echo "  Ironbark — Learning Loop for Claude Code"
echo "========================================"
echo ""

# 1. Create directories
echo "[1/5] Creating directories..."
mkdir -p "$CLAUDE_DIR/commands"
mkdir -p "$CLAUDE_DIR/skills/ironbark"
mkdir -p "$CLAUDE_DIR/skills/harvested"
mkdir -p "$IRONBARK_DIR/hooks"
mkdir -p "$IRONBARK_DIR/lib"

# 2. Copy command
echo "[2/5] Installing /ironbark command..."
cp "$SCRIPT_DIR/commands/ironbark.md" "$CLAUDE_DIR/commands/ironbark.md"

# 3. Copy skill
echo "[3/5] Installing ironbark skill..."
cp "$SCRIPT_DIR/skills/ironbark/SKILL.md" "$CLAUDE_DIR/skills/ironbark/SKILL.md"

# 4. Copy hooks and libs
echo "[4/5] Installing hooks and libraries..."
cp "$SCRIPT_DIR/hooks/auto-claude-md.js" "$IRONBARK_DIR/hooks/auto-claude-md.js"
cp "$SCRIPT_DIR/hooks/ironbark-auto.js" "$IRONBARK_DIR/hooks/ironbark-auto.js"
cp "$SCRIPT_DIR/lib/utils.js" "$IRONBARK_DIR/lib/utils.js"
cp "$SCRIPT_DIR/lib/project-detect.js" "$IRONBARK_DIR/lib/project-detect.js"

# 5. Register hooks in settings.json
echo "[5/5] Registering hooks in settings.json..."

SETTINGS_FILE="$CLAUDE_DIR/settings.json"

# Determine the correct path format for hooks
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OS" == "Windows_NT" ]]; then
  # Windows: use forward-slash paths
  HOOK_BASE="$(cygpath -m "$IRONBARK_DIR" 2>/dev/null || echo "$IRONBARK_DIR" | sed 's|\\|/|g')"
else
  HOOK_BASE="$IRONBARK_DIR"
fi

# Create settings.json if it doesn't exist
if [ ! -f "$SETTINGS_FILE" ]; then
  echo '{}' > "$SETTINGS_FILE"
fi

# Use node to safely merge hooks into settings.json
node -e "
const fs = require('fs');
const settingsPath = '$SETTINGS_FILE'.replace(/'/g, '');
const hookBase = '$HOOK_BASE'.replace(/'/g, '');

let settings;
try {
  settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
} catch {
  settings = {};
}

if (!settings.hooks) settings.hooks = {};
if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];
if (!settings.hooks.Stop) settings.hooks.Stop = [];

// Check if hooks already registered
const hasBootstrap = settings.hooks.SessionStart.some(h => h.description && h.description.includes('Ironbark'));
const hasNudge = settings.hooks.Stop.some(h => h.description && h.description.includes('Ironbark'));

if (!hasBootstrap) {
  settings.hooks.SessionStart.push({
    matcher: '*',
    hooks: [{
      type: 'command',
      command: 'node \"' + hookBase + '/hooks/auto-claude-md.js\"'
    }],
    description: 'Ironbark: Auto-create CLAUDE.md or inject Ironbark section'
  });
}

if (!hasNudge) {
  settings.hooks.Stop.push({
    matcher: '*',
    hooks: [{
      type: 'command',
      command: 'node \"' + hookBase + '/hooks/ironbark-auto.js\"',
      async: true,
      timeout: 10
    }],
    description: 'Ironbark: Nudge /ironbark after complex sessions (15+ tool calls)'
  });
}

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
console.log('  Hooks registered successfully.');
"

echo ""
echo "========================================"
echo "  Ironbark installed successfully!"
echo "========================================"
echo ""
echo "What's installed:"
echo "  - /ironbark command       (manual skill harvesting)"
echo "  - Auto-bootstrap hook     (auto-creates CLAUDE.md with Ironbark)"
echo "  - Auto-nudge hook         (suggests /ironbark after complex sessions)"
echo "  - Harvested skills dir    (~/.claude/skills/harvested/)"
echo ""
echo "Usage:"
echo "  1. Open any project in Claude Code"
echo "  2. CLAUDE.md will be auto-created/updated with Ironbark"
echo "  3. After complex work, run /ironbark to harvest skills"
echo "  4. Skills are shared across all your projects"
echo ""
echo "To uninstall: bash uninstall.sh"
