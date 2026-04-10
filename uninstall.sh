#!/usr/bin/env bash
#
# Ironbark Uninstaller
# Removes Ironbark hooks and files from Claude Code
#
# Usage: bash uninstall.sh
#

set -e

CLAUDE_DIR="$HOME/.claude"
IRONBARK_DIR="$CLAUDE_DIR/ironbark"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"

echo "Uninstalling Ironbark..."

# Remove 30-minute background sync (cron / Windows scheduled task)
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OS" == "Windows_NT" ]]; then
  if [ -f "$IRONBARK_DIR/lib/schedule-uninstall.ps1" ] && command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -ExecutionPolicy Bypass -File "$IRONBARK_DIR/lib/schedule-uninstall.ps1" 2>/dev/null || true
  fi
else
  if [ -f "$IRONBARK_DIR/lib/schedule-uninstall.sh" ]; then
    bash "$IRONBARK_DIR/lib/schedule-uninstall.sh" 2>/dev/null || true
  fi
fi

# Remove hooks from settings.json
if [ -f "$SETTINGS_FILE" ]; then
  node -e "
const fs = require('fs');
const settingsPath = '$SETTINGS_FILE';
let s;
try { s = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { process.exit(0); }
if (s.hooks) {
  ['SessionStart', 'Stop', 'PreToolUse'].forEach(k => {
    if (s.hooks[k]) s.hooks[k] = s.hooks[k].filter(h => !h.description || !h.description.includes('Ironbark'));
  });
}
fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2) + '\n');
console.log('  Hooks removed from settings.json');
" 2>/dev/null || true
fi

# Remove files
rm -f "$CLAUDE_DIR/commands/ironbark.md"
rm -rf "$CLAUDE_DIR/skills/ironbark"
rm -rf "$IRONBARK_DIR"

echo ""
echo "Ironbark uninstalled."
echo "Note: Harvested skills in ~/.claude/skills/harvested/ were preserved."
echo "      Delete them manually if you want a clean removal."
