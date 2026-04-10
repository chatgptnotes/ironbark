#
# Ironbark Scheduler Uninstaller (Windows)
# Removes the IronbarkSync scheduled task if present.
#

$ErrorActionPreference = "Continue"
$TaskName = "IronbarkSync"

$existing = schtasks.exe /Query /TN $TaskName 2>&1
if ($LASTEXITCODE -eq 0) {
    schtasks.exe /Delete /TN $TaskName /F 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Scheduled task '$TaskName' removed"
    }
}
