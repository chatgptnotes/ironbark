#!/usr/bin/env bash
#
# Ironbark Scheduler Uninstaller (macOS / Linux)
# Removes the */30 min cron entry for lib/sync-cli.js.
#

MARKER="# IRONBARK_SYNC_CRON"

if ! command -v crontab >/dev/null 2>&1; then
  exit 0
fi

current=$(crontab -l 2>/dev/null || true)
if ! echo "$current" | grep -qF "$MARKER"; then
  exit 0
fi

# Drop the marker line and the next line (the actual cron entry)
new=$(echo "$current" | awk -v m="$MARKER" '
  $0 == m { skip = 2; next }
  skip > 0 { skip--; next }
  { print }
')

echo "$new" | crontab -
echo "  Ironbark sync cron removed"
