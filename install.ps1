#
# Ironbark Installer (Windows PowerShell)
# Installs the Ironbark learning loop into Claude Code
#
# Usage: powershell -ExecutionPolicy Bypass -File install.ps1
#

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ClaudeDir = Join-Path $env:USERPROFILE ".claude"
$IronbarkDir = Join-Path $ClaudeDir "ironbark"

Write-Host "========================================"
Write-Host "  Ironbark - Learning Loop for Claude Code"
Write-Host "========================================"
Write-Host ""

# 1. Create directories
Write-Host "[1/5] Creating directories..."
@(
    (Join-Path $ClaudeDir "commands"),
    (Join-Path $ClaudeDir "skills\ironbark"),
    (Join-Path $ClaudeDir "skills\harvested"),
    (Join-Path $IronbarkDir "hooks"),
    (Join-Path $IronbarkDir "lib")
) | ForEach-Object {
    if (-not (Test-Path $_)) { New-Item -ItemType Directory -Path $_ -Force | Out-Null }
}

# 2. Copy command
Write-Host "[2/5] Installing /ironbark command..."
Copy-Item (Join-Path $ScriptDir "commands\ironbark.md") (Join-Path $ClaudeDir "commands\ironbark.md") -Force

# 3. Copy skill
Write-Host "[3/5] Installing ironbark skill..."
Copy-Item (Join-Path $ScriptDir "skills\ironbark\SKILL.md") (Join-Path $ClaudeDir "skills\ironbark\SKILL.md") -Force

# 4. Copy hooks and libs
Write-Host "[4/5] Installing hooks and libraries..."
Copy-Item (Join-Path $ScriptDir "hooks\auto-claude-md.js") (Join-Path $IronbarkDir "hooks\auto-claude-md.js") -Force
Copy-Item (Join-Path $ScriptDir "hooks\ironbark-auto.js") (Join-Path $IronbarkDir "hooks\ironbark-auto.js") -Force
Copy-Item (Join-Path $ScriptDir "lib\utils.js") (Join-Path $IronbarkDir "lib\utils.js") -Force
Copy-Item (Join-Path $ScriptDir "lib\project-detect.js") (Join-Path $IronbarkDir "lib\project-detect.js") -Force

# 5. Register hooks
Write-Host "[5/5] Registering hooks in settings.json..."

$HookBase = $IronbarkDir -replace '\\', '/'
$SettingsFile = Join-Path $ClaudeDir "settings.json"

$nodeScript = @"
const fs = require('fs');
const settingsPath = '$($SettingsFile -replace '\\', '/')';
const hookBase = '$HookBase';

let settings;
try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { settings = {}; }

if (!settings.hooks) settings.hooks = {};
if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];
if (!settings.hooks.Stop) settings.hooks.Stop = [];

const hasBootstrap = settings.hooks.SessionStart.some(h => h.description && h.description.includes('Ironbark'));
const hasNudge = settings.hooks.Stop.some(h => h.description && h.description.includes('Ironbark'));

if (!hasBootstrap) {
  settings.hooks.SessionStart.push({
    matcher: '*',
    hooks: [{ type: 'command', command: 'node "' + hookBase + '/hooks/auto-claude-md.js"' }],
    description: 'Ironbark: Auto-create CLAUDE.md or inject Ironbark section'
  });
}

if (!hasNudge) {
  settings.hooks.Stop.push({
    matcher: '*',
    hooks: [{ type: 'command', command: 'node "' + hookBase + '/hooks/ironbark-auto.js"', async: true, timeout: 10 }],
    description: 'Ironbark: Nudge /ironbark after complex sessions (15+ tool calls)'
  });
}

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
console.log('  Hooks registered successfully.');
"@

node -e $nodeScript

Write-Host ""
Write-Host "========================================"
Write-Host "  Ironbark installed successfully!"
Write-Host "========================================"
Write-Host ""
Write-Host "What's installed:"
Write-Host "  - /ironbark command       (manual skill harvesting)"
Write-Host "  - Auto-bootstrap hook     (auto-creates CLAUDE.md with Ironbark)"
Write-Host "  - Auto-nudge hook         (suggests /ironbark after complex sessions)"
Write-Host "  - Harvested skills dir    (~/.claude/skills/harvested/)"
Write-Host ""
Write-Host "Usage:"
Write-Host "  1. Open any project in Claude Code"
Write-Host "  2. CLAUDE.md will be auto-created/updated with Ironbark"
Write-Host "  3. After complex work, run /ironbark to harvest skills"
Write-Host "  4. Skills are shared across all your projects"
