#!/usr/bin/env bash
#
# Ironbark Scheduler Installer (macOS / Linux)
# Adds a */30 min cron entry that runs lib/sync-cli.js to sync community skills.
#
# Idempotent: safe to re-run, won't duplicate entries.
#

set -e

IRONBARK_DIR="${IRONBARK_DIR:-$HOME/.claude/ironbark}"
SYNC_CLI="$IRONBARK_DIR/lib/sync-cli.js"
MARKER="# IRONBARK_SYNC_CRON"
CRON_LINE="*/30 * * * * /usr/bin/env node \"$SYNC_CLI\" >/dev/null 2>&1"

if ! command -v crontab >/dev/null 2>&1; then
  echo "  crontab not available — scheduled sync NOT installed"
  echo "  (Ironbark will still sync on Claude Code session events via hooks)"
  exit 0
fi

if [ ! -f "$SYNC_CLI" ]; then
  echo "  sync-cli.js not found at $SYNC_CLI — skipping scheduler"
  exit 0
fi

current=$(crontab -l 2>/dev/null || true)
if echo "$current" | grep -q "$MARKER"; then
  echo "  Ironbark sync cron already installed (every 30 min)"
  exit 0
fi

{
  if [ -n "$current" ]; then
    echo "$current"
  fi
  echo ""
  echo "$MARKER"
  echo "$CRON_LINE"
} | crontab -

echo "  Cron entry added: every 30 minutes"
