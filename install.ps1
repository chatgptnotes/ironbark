#
# Ironbark Installer (Windows PowerShell)
# Installs the Ironbark learning loop into Claude Code with community sync.
#
# Usage: powershell -ExecutionPolicy Bypass -File install.ps1
#

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ClaudeDir = Join-Path $env:USERPROFILE ".claude"
$IronbarkDir = Join-Path $ClaudeDir "ironbark"
$RepoDir = Join-Path $ClaudeDir "ironbark-repo"
$RepoUrl = "https://github.com/chatgptnotes/ironbark.git"

Write-Host "========================================"
Write-Host "  Ironbark - Learning Loop for Claude Code"
Write-Host "  with Community Sync (chatgptnotes/ironbark)"
Write-Host "========================================"
Write-Host ""

# [1/8] Create directories
Write-Host "[1/8] Creating directories..."
@(
    (Join-Path $ClaudeDir "commands"),
    (Join-Path $ClaudeDir "skills\ironbark"),
    (Join-Path $ClaudeDir "skills\harvested"),
    (Join-Path $IronbarkDir "hooks"),
    (Join-Path $IronbarkDir "lib")
) | ForEach-Object {
    if (-not (Test-Path $_)) { New-Item -ItemType Directory -Path $_ -Force | Out-Null }
}

# [2/8] Install /ironbark command
Write-Host "[2/8] Installing /ironbark command..."
Copy-Item (Join-Path $ScriptDir "commands\ironbark.md") (Join-Path $ClaudeDir "commands\ironbark.md") -Force

# [3/8] Install ironbark skill
Write-Host "[3/8] Installing ironbark skill..."
Copy-Item (Join-Path $ScriptDir "skills\ironbark\SKILL.md") (Join-Path $ClaudeDir "skills\ironbark\SKILL.md") -Force

# [4/8] Copy hooks and libs
Write-Host "[4/8] Installing hooks and libraries..."
$HookFiles = @("auto-claude-md.js", "ironbark-auto.js", "ironbark-sync-pull.js", "ironbark-sync-push.js")
foreach ($f in $HookFiles) {
    $src = Join-Path $ScriptDir "hooks\$f"
    if (Test-Path $src) { Copy-Item $src (Join-Path $IronbarkDir "hooks\$f") -Force }
}
$LibFiles = @("utils.js", "project-detect.js", "sync.js", "push-flag.js", "sync-cli.js",
              "schedule-install.sh", "schedule-install.ps1",
              "schedule-uninstall.sh", "schedule-uninstall.ps1")
foreach ($f in $LibFiles) {
    $src = Join-Path $ScriptDir "lib\$f"
    if (Test-Path $src) { Copy-Item $src (Join-Path $IronbarkDir "lib\$f") -Force }
}

# [5/8] Clone / update community repo
Write-Host "[5/8] Setting up community repo sync..."
if (Test-Path (Join-Path $RepoDir ".git")) {
    Write-Host "  Repo exists - pulling latest..."
    Push-Location $RepoDir
    try { git pull --ff-only 2>$null | Out-Null } catch { Write-Host "  Pull skipped" }
    Pop-Location
} else {
    Write-Host "  Cloning chatgptnotes/ironbark..."
    try {
        git clone $RepoUrl $RepoDir 2>$null | Out-Null
    } catch {
        Write-Host "  Clone failed - will retry on session start"
    }
}

# Seed local harvested skills from repo
$RepoHarvestedDir = Join-Path $RepoDir "harvested"
if (Test-Path $RepoHarvestedDir) {
    $SkillCount = 0
    Get-ChildItem $RepoHarvestedDir -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        $skillName = $_.Name
        if ($skillName -eq ".gitkeep") { return }
        $src = Join-Path $_.FullName "SKILL.md"
        if (Test-Path $src) {
            $destDir = Join-Path $ClaudeDir "skills\harvested\$skillName"
            if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
            Copy-Item $src (Join-Path $destDir "SKILL.md") -Force
            $SkillCount++
        }
    }
    Write-Host "  Synced $SkillCount community skill(s)"
}

# [6/8] Register hooks in settings.json
Write-Host "[6/8] Registering hooks..."
$SettingsFile = Join-Path $ClaudeDir "settings.json"
$HookBase = $IronbarkDir -replace '\\', '/'
if (-not (Test-Path $SettingsFile)) { Set-Content -Path $SettingsFile -Value "{}" }

$nodeScript = @"
const fs = require('fs');
const settingsPath = '$($SettingsFile -replace '\\', '/')';
const hookBase = '$HookBase';

let s;
try { s = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { s = {}; }
if (!s.hooks) s.hooks = {};

['SessionStart', 'Stop', 'PreToolUse'].forEach(k => {
  if (!s.hooks[k]) s.hooks[k] = [];
  s.hooks[k] = s.hooks[k].filter(x => !(x.description && x.description.includes('Ironbark')));
});

s.hooks.SessionStart.push({
  matcher: '*',
  hooks: [{ type: 'command', command: 'node "' + hookBase + '/hooks/auto-claude-md.js"' }],
  description: 'Ironbark: Auto-bootstrap CLAUDE.md'
});
s.hooks.SessionStart.push({
  matcher: '*',
  hooks: [{ type: 'command', command: 'node "' + hookBase + '/hooks/ironbark-sync-pull.js"', timeout: 30 }],
  description: 'Ironbark: Pull community skills from chatgptnotes/ironbark'
});
s.hooks.Stop.push({
  matcher: '*',
  hooks: [{ type: 'command', command: 'node "' + hookBase + '/hooks/ironbark-auto.js"', async: true, timeout: 10 }],
  description: 'Ironbark: Nudge after complex sessions'
});
s.hooks.Stop.push({
  matcher: '*',
  hooks: [{ type: 'command', command: 'node "' + hookBase + '/hooks/ironbark-sync-push.js"', async: true, timeout: 30 }],
  description: 'Ironbark: Auto-push skills to chatgptnotes/ironbark'
});
s.hooks.PreToolUse.push({
  matcher: 'Write|Edit',
  hooks: [{ type: 'command', command: 'node "' + hookBase + '/hooks/ironbark-sync-pull.js"', async: true, timeout: 15 }],
  description: 'Ironbark: Mid-session skill sync (stale >30min)'
});

fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2) + '\n');
console.log('  Hooks registered.');
"@

node -e $nodeScript

# [7/8] Register Windows scheduled task for 30-min background sync
Write-Host "[7/8] Registering 30-minute background sync..."
$SchedInstall = Join-Path $IronbarkDir "lib\schedule-install.ps1"
if (Test-Path $SchedInstall) {
    & powershell.exe -ExecutionPolicy Bypass -File $SchedInstall
} else {
    Write-Host "  schedule-install.ps1 missing - skipping"
}

# [8/8] Done
Write-Host "[8/8] Done!"
Write-Host ""
Write-Host "========================================"
Write-Host "  Ironbark installed!"
Write-Host "========================================"
Write-Host ""
Write-Host "  /ironbark          - harvest skills from session"
Write-Host "  Auto-pull          - community skills on session start"
Write-Host "  Auto-push          - new skills after /ironbark harvest"
Write-Host "  Mid-session sync   - pulls if stale >30min"
Write-Host "  Background sync    - pull+push every 30 min (Task Scheduler)"
Write-Host "  Repo               - github.com/chatgptnotes/ironbark"
Write-Host ""
Write-Host "  Opt-out: setx IRONBARK_SYNC_DISABLED 1"
Write-Host ""
Write-Host "To uninstall: powershell -ExecutionPolicy Bypass -File uninstall.ps1"
