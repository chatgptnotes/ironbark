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
$NodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCmd) {
    Write-Host "  node.exe not found in PATH - skipping scheduler"
    Write-Host "  (Ironbark will still sync on Claude Code session events via hooks)"
    exit 0
}
$NodeExe = $NodeCmd.Source

# Use the modern ScheduledTasks cmdlets instead of schtasks.exe.
# They accept -Execute / -Argument as distinct parameters, so paths with
# spaces (e.g. "C:\Program Files\nodejs\node.exe") are handled correctly
# without manual quoting hacks.
try {
    # Remove any pre-existing task so we can re-register cleanly
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    }

    $action = New-ScheduledTaskAction -Execute $NodeExe -Argument ('"' + $SyncCli + '"')

    # -Once at now, repeating every 30 minutes for effectively forever.
    # PowerShell requires RepetitionDuration alongside RepetitionInterval
    # when using -Once; use 1000 days (re-registered on each install).
    $trigger = New-ScheduledTaskTrigger `
        -Once `
        -At (Get-Date) `
        -RepetitionInterval (New-TimeSpan -Minutes 30) `
        -RepetitionDuration (New-TimeSpan -Days 1000)

    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
        -MultipleInstances IgnoreNew

    $principal = New-ScheduledTaskPrincipal `
        -UserId $env:USERNAME `
        -LogonType Interactive `
        -RunLevel Limited

    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal `
        -Description "Ironbark community skill sync (every 30 min)" | Out-Null

    Write-Host "  Windows scheduled task '$TaskName' registered (every 30 min)"
} catch {
    Write-Host "  Scheduled task registration failed: $($_.Exception.Message)"
    Write-Host "  (Ironbark will still sync on Claude Code session events via hooks)"
}
