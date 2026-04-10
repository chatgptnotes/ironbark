---
name: openwrt-busybox-shell-scripting
description: Practical shell scripting on OpenWrt/BusyBox edge devices (Teltonika TRB/RUT, GL.iNet, etc.). Covers what doesn't work (bash, jq, arrays) and what to use instead (Lua, uci, gsmctl, ubus, logger/logread, strings on SQLite). Avoids hours of trial-and-error on first deploy.
source_project: flownexus
projects_used_in: [flownexus]
tags: [openwrt, busybox, teltonika, embedded, shell, lua, iot, edge, rutos]
harvested_from_session: 2026-04-10
---

# OpenWrt / BusyBox Shell Scripting

## Environment Reality Check

On OpenWrt (RutOS, LEDE, stock OpenWrt) the default shell is **BusyBox `ash`**, not bash. Many "universal" shell idioms fail silently or give wrong results. Assume NONE of the following are available unless you install them from `opkg`:

- `bash` (use `/bin/sh` which is ash)
- `jq` (use `lua -e` with `lsqlite3`/pattern matching, or `jsonfilter`)
- `awk` is BusyBox awk (limited)
- `sed` is BusyBox sed (limited regex)
- Arrays (`arr=(a b c)`) — ash has no arrays; use files or positional params
- `[[ ... ]]` (use `[ ... ]`)
- `echo -e` (use `printf`)
- `mapfile` / `readarray` — not available
- `curl` is built-in BUT with limited cipher support — use `-k` for self-signed and watch HTTPS redirect behavior (see gotcha below)

## What IS available

### System introspection: `logger` and `logread`

BusyBox has no persistent syslog by default. Use the in-memory ring buffer:

```sh
# Write to syslog with a tag
logger -t my_script "Starting flow collection"

# Read syslog (tail-compatible)
logread | grep my_script | tail -20

# Follow live
logread -f | grep my_script
```

Logs persist only until reboot unless you enable `/etc/config/system.logfile`.

### Config management: `uci`

OpenWrt's universal configuration interface. Commands apply to `/etc/config/*` files.

```sh
# Read all keys for a package
uci show modbus

# Set values (in memory)
uci set modbus.device_1=device
uci set modbus.device_1.name='NIVUS_001'
uci set modbus.device_1.ip='192.168.1.10'
uci set modbus.device_1.enabled='1'

# Persist to disk
uci commit modbus

# Restart affected service
/etc/init.d/modbus_client restart

# Delete a whole section
uci delete modbus 2>/dev/null
```

**Chain with `&&`** for atomic-ish multi-set:

```sh
uci set modbus.device_1=device && \
uci set modbus.device_1.name='NIVUS_001' && \
uci set modbus.device_1.ip='192.168.1.10' && \
uci commit modbus
```

### JSON parsing: `lua -e` (no jq)

Teltonika and most OpenWrt images ship Lua. Use it for anything more complex than `grep`-based extraction.

```sh
# Extract a field from a JSON response
response=$(curl -sk https://api.example.com/status)
echo "$response" | lua -e '
local raw = io.read("*a")
local status = raw:match("\"status\"%s*:%s*\"([^\"]+)\"")
print(status or "unknown")
'
```

**For complex JSON with nested objects**, read into balanced-match captures: `%b{}` captures a full `{...}` including nesting, `%b[]` for arrays.

```lua
-- Find the "command" object inside {"command":{...}}
local obj = raw:match("\"command\"%s*:%s*(%b{})")
```

**Escaping inside shell heredoc:** when embedding Lua inside a shell script, use single quotes around the script and interpolate shell vars via concatenation:

```sh
result=$(lua -e '
local var = "'"$SHELL_VAR"'"
print(var)
')
```

### Service scripts: `/etc/init.d/*` and `procd`

To auto-start a custom script at boot, create an init.d service (preferred over `@reboot` cron because cron may start before network/modem).

```sh
# /etc/init.d/my_agent
#!/bin/sh /etc/rc.common
USE_PROCD=1
START=95
STOP=10

start_service() {
    procd_open_instance
    procd_set_param command /root/my_agent.sh
    procd_set_param respawn 3600 5 0  # respawn with 5s delay, unlimited retries
    procd_set_param stdout 1
    procd_set_param stderr 1
    procd_close_instance
}
```

Enable and start:

```sh
chmod +x /etc/init.d/my_agent
/etc/init.d/my_agent enable
/etc/init.d/my_agent start
```

**Alternative: cron-based watchdog.** If you can't install an init.d service (OpenWrt image is read-only overlay), a cron job can check a PID file every minute and restart the daemon. See `pull-based-remote-agent-architecture` skill for the pattern.

### ubus: message bus for services

Many OpenWrt services expose RPC via `ubus`. Teltonika's `modbus.client` is one example:

```sh
# List all ubus objects
ubus list

# Call a method
ubus call modbus.client read_holding '{"slave_id":1,"address":100}'

# Filter JSON output
ubus call modbus.client read_holding '{"slave_id":1,"address":100}' | jsonfilter -e '@.value'
```

**`jsonfilter`** is a BusyBox-friendly JSON extractor (comes with `libubox`) — use it instead of jq when you only need simple key lookups.

### Cellular: `gsmctl` on Teltonika

RutOS ships `gsmctl` for cellular control and SMS:

```sh
# Send SMS
gsmctl -S -s "+911234567890 Your message here"

# Check signal
gsmctl -q  # signal quality (dBm)

# Check connection state
gsmctl -A 'AT+CREG?'

# Get IMEI
gsmctl -i
```

On non-Teltonika OpenWrt, use `mmcli` (ModemManager) or the package that ships with your modem driver.

### Reading Modbus SQLite DB with `strings` (hack)

Teltonika's Modbus client writes responses to `/tmp/run/modbus_client/modbus.db` (SQLite). BusyBox has no `sqlite3` CLI by default, but the data-plane values are stored as plain text inside BLOBs. Two options:

**Option A — `strings` hack (no deps):**

```sh
strings /tmp/run/modbus_client/modbus.db 2>/dev/null | \
  grep -i -A1 "device_1.*flow_rate" | \
  grep "^\[" | \
  sed "s/\[//;s/\]//"
```

Fragile but dependency-free.

**Option B — `lsqlite3` via Lua (recommended):**

```sh
opkg update && opkg install lua-sqlite3  # if not present
```

```lua
local s = require("lsqlite3")
local db = s.open("/tmp/run/modbus_client/modbus.db")
for row in db:nrows("SELECT server_name, request_name, response_data FROM modbus_data ORDER BY id DESC LIMIT 100") do
    print(row.server_name, row.request_name, row.response_data)
end
db:close()
```

Proper schema access, but adds an opkg dependency.

## Gotchas

### 1. HTTPS redirects: built-in data_sender fails on 308

Teltonika's `data_sender` package does NOT follow HTTP 308 permanent redirects. If your cloud endpoint redirects (e.g., Cloudflare `www.` normalization), data silently fails. **Fix:** use the canonical URL (with or without `www.`) that returns 200 directly, or bypass `data_sender` with a custom curl-based cron script.

### 2. HTTPS cipher suites

BusyBox curl sometimes ships with a minimal mbedTLS build that rejects modern cipher suites. Symptoms: "SSL handshake failed" against AWS/Cloudflare. **Fix:** either install `curl` + `libcurl4` from opkg (full OpenSSL), or use `-k` to skip verify as a LAST resort in isolated networks.

### 3. `sleep` fractional seconds

BusyBox `sleep` may or may not accept `sleep 0.5` depending on build. Test before assuming sub-second sleeps work.

### 4. `ps` output columns vary

BusyBox `ps` has different columns than procps `ps`. Use `ps w` (wide) to see full command lines. Don't rely on column indices — grep by pattern.

### 5. `/tmp` is tmpfs (RAM)

Everything in `/tmp` is lost on reboot. Good for state files, bad for anything that must survive power loss. Persistent storage lives in `/root/`, `/etc/`, `/overlay/` (size-limited).

### 6. Overlay filesystem fills up fast

OpenWrt uses a squashfs read-only base + JFFS2 overlay. The overlay is TINY (often 5-20 MB). Watch out for:
- Large log files in `/tmp` that get rotated to `/root`
- Installed opkg packages bloating the overlay
- Left-behind `.ipk` files in `/tmp/opkg-*`

Check with `df -h /overlay` or `df -h /`. When full, config writes silently fail.

### 7. Cron daemon must be restarted after crontab edits

```sh
echo "* * * * * /root/my_script.sh" >> /etc/crontabs/root
/etc/init.d/cron restart  # ← REQUIRED; cron does not auto-reload
```

Check cron is enabled:

```sh
/etc/init.d/cron enable
```

### 8. `DEBUG=1` env var convention

OpenWrt scripts commonly gate verbose output on `DEBUG`:

```sh
log_debug() { [ -n "$DEBUG" ] && logger -t my_script "[DEBUG] $1"; }
```

Invoke with: `DEBUG=1 /root/my_script.sh`.

## Deployment: `scp` + `sed` line-ending fix

When editing scripts on Windows and copying via `pscp`/`scp`, CRLF line endings break `#!/bin/sh`. Strip them on the device:

```sh
sed -i 's/\r$//' /root/my_script.sh
chmod +x /root/my_script.sh
```

Or configure your editor to save as LF. EditorConfig:

```
[*.sh]
end_of_line = lf
```

## Minimal daemon template

```sh
#!/bin/sh
# Safe BusyBox-compatible long-running daemon

PID_FILE="/var/run/my_agent.pid"
LOG_TAG="my_agent"

log()   { logger -t "$LOG_TAG" "$1"; }
debug() { [ -n "$DEBUG" ] && logger -t "$LOG_TAG" "[DEBUG] $1"; }

check_single_instance() {
    if [ -f "$PID_FILE" ]; then
        old_pid=$(cat "$PID_FILE" 2>/dev/null)
        if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
            log "Already running as PID $old_pid"
            exit 1
        fi
        rm -f "$PID_FILE"
    fi
    echo $$ > "$PID_FILE"
}

cleanup() {
    rm -f "$PID_FILE"
    log "Daemon stopped"
    exit 0
}

trap cleanup INT TERM
check_single_instance
log "Daemon started (PID $$)"

while true; do
    # Do work here
    sleep 5
done
```

## Reference

- OpenWrt docs: <https://openwrt.org/docs/guide-user/base-system/start>
- BusyBox applet list: <https://busybox.net/downloads/BusyBox.html>
- Teltonika RutOS manual: <https://wiki.teltonika-networks.com/view/RutOS>
