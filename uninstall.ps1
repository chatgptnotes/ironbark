#
# Ironbark Uninstaller (Windows PowerShell)
# Removes Ironbark hooks, scheduled task, and files from Claude Code.
#
# Usage: powershell -ExecutionPolicy Bypass -File uninstall.ps1
#

$ErrorActionPreference = "Continue"

$ClaudeDir = Join-Path $env:USERPROFILE ".claude"
$IronbarkDir = Join-Path $ClaudeDir "ironbark"
$SettingsFile = Join-Path $ClaudeDir "settings.json"

Write-Host "Uninstalling Ironbark..."

# Remove 30-minute background scheduled task
$SchedUninstall = Join-Path $IronbarkDir "lib\schedule-uninstall.ps1"
if (Test-Path $SchedUninstall) {
    & powershell.exe -ExecutionPolicy Bypass -File $SchedUninstall
}

# Remove hooks from settings.json
if (Test-Path $SettingsFile) {
    $nodeScript = @"
const fs = require('fs');
const p = '$($SettingsFile -replace '\\', '/')';
let s;
try { s = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { process.exit(0); }
if (s.hooks) {
  ['SessionStart', 'Stop', 'PreToolUse'].forEach(k => {
    if (s.hooks[k]) s.hooks[k] = s.hooks[k].filter(h => !h.description || !h.description.includes('Ironbark'));
  });
}
fs.writeFileSync(p, JSON.stringify(s, null, 2) + '\n');
console.log('  Hooks removed from settings.json');
"@
    try { node -e $nodeScript } catch { }
}

# Remove files
$CommandFile = Join-Path $ClaudeDir "commands\ironbark.md"
if (Test-Path $CommandFile) { Remove-Item $CommandFile -Force }

$SkillDir = Join-Path $ClaudeDir "skills\ironbark"
if (Test-Path $SkillDir) { Remove-Item $SkillDir -Recurse -Force }

if (Test-Path $IronbarkDir) { Remove-Item $IronbarkDir -Recurse -Force }

Write-Host ""
Write-Host "Ironbark uninstalled."
Write-Host "Note: Harvested skills in ~/.claude/skills/harvested/ were preserved."
Write-Host "      Delete them manually if you want a clean removal."
