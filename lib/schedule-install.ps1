#
# Ironbark Scheduler Installer (Windows)
# Registers a Windows Scheduled Task that runs lib/sync-cli.js every 30 minutes.
#
# Idempotent: safe to re-run, replaces any existing task.
#

$ErrorActionPreference = "Continue"

$TaskName = "IronbarkSync"
$IronbarkDir = Join-Path $env:USERPROFILE ".claude\ironbark"
$SyncCli = Join-Path $IronbarkDir "lib\sync-cli.js"

if (-not (Test-Path $SyncCli)) {
    Write-Host "  sync-cli.js not found at $SyncCli - skipping scheduler"
    exit 0
}

# Locate node.exe (falls back to PATH-resolved node)
$NodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $NodeExe) {
    Write-Host "  node.exe not found in PATH - skipping scheduler"
    Write-Host "  (Ironbark will still sync on Claude Code session events via hooks)"
    exit 0
}

# Use schtasks.exe: simpler, more reliable than New-ScheduledTask for recurring tasks
$cmdArgs = "`"$SyncCli`""
$runCmd = "`"$NodeExe`" $cmdArgs"

# /SC MINUTE /MO 30  = every 30 minutes
# /F                 = force replace if already exists
# /RL LIMITED        = run with user's current privileges (no UAC elevation)
$result = schtasks.exe /Create /SC MINUTE /MO 30 /TN $TaskName /TR $runCmd /F /RL LIMITED 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "  Windows scheduled task '$TaskName' registered (every 30 min)"
} else {
    Write-Host "  schtasks registration failed: $result"
    Write-Host "  (Ironbark will still sync on Claude Code session events via hooks)"
}
