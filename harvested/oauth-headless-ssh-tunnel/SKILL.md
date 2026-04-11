---
name: oauth-headless-ssh-tunnel
description: Complete an OAuth2 browser flow on a headless Linux server by forwarding the redirect URI port via SSH tunnel — no browser, VNC, or public port needed.
source_project: aiinmail.com/bot-2-19feb2026
projects_used_in: [aiinmail.com]
tags: [oauth, ssh, headless, linux, vps, gcalcli, google-api, tunnel, python]
harvested_from_session: 2026-04-12
---

# OAuth on a Headless Server via SSH Tunnel

## Problem

Many CLI tools (gcalcli, gcloud, GitHub CLI, Spotify, etc.) need to complete an OAuth2 authorization flow where:
1. The tool opens a browser URL
2. The user logs in and grants permission
3. The provider redirects to `http://localhost:PORT/?code=...`
4. The tool captures the code and exchanges it for a token

On a headless Linux server (VPS, CI, Docker), there is **no browser**, and the redirect to `localhost:PORT` only reaches the server — not your laptop where the browser is open.

## Solution

Use SSH port forwarding to bridge the gap:
- Your **laptop's** `localhost:PORT` → tunneled → **server's** `localhost:PORT`
- A Python HTTP server on the server captures the redirect and prints the URL
- You paste the full redirect URL back to the tool to complete the exchange

## Step-by-Step

### 1. Register the redirect URI

In your OAuth app settings (Google Cloud Console, GitHub OAuth App, etc.), add:
```
http://localhost:PORT/
```
where PORT matches what the CLI tool will use (or any free port you choose).

For **gcalcli**: use `http://localhost:48315/` — it probes ports starting at 48315.

### 2. Start the capture server on the VPS

```bash
# On the VPS — capture the redirect code
python3 -c "
import http.server, socketserver, urllib.parse

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        print('REDIRECT URL:', 'http://localhost:PORT' + self.path)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'<h1>Auth captured! Return to terminal.</h1>')
    def log_message(self, *a): pass

with socketserver.TCPServer(('0.0.0.0', PORT), Handler) as s:
    print('Waiting for OAuth redirect...')
    s.handle_request()
" &
```

Replace `PORT` with your actual port number (e.g., 48315).

### 3. Open the SSH tunnel (on your laptop)

```bash
ssh -N -L PORT:localhost:PORT user@your-server
```

This forwards your local `localhost:PORT` → server's `localhost:PORT`. Keep it running.

### 4. Run the CLI auth command on the VPS

```bash
# gcalcli
gcalcli init

# gcloud
gcloud auth login --no-launch-browser

# GitHub CLI (different — it gives a device code instead)
gh auth login
```

The tool prints an authorization URL. Open it in your **laptop's browser**.

### 5. Complete the OAuth flow in the browser

1. Open the URL in your browser
2. Log in and grant permission
3. Google/GitHub redirects to `http://localhost:PORT/?code=XXXX&state=YYYY`
4. Your laptop's localhost:PORT is forwarded via SSH tunnel to the VPS
5. The Python capture server on the VPS prints the full redirect URL

### 6. Hand the code back to the tool (if needed)

Some tools (gcalcli, oauth2client-based) handle the redirect automatically when the server captures it.

For tools that ask you to paste the code:
```
Paste the code: 4/0Aci98xyz...
```
Extract the `code=` parameter from the captured URL and paste it.

## gcalcli Specific Notes

- gcalcli stores credentials as a **pickle file**, not JSON
- Default path: `~/.local/share/gcalcli/oauth`
- After successful auth, verify with: `gcalcli agenda`
- If you get `FileNotFoundError`, check the directory exists: `mkdir -p ~/.local/share/gcalcli`

### Creating gcalcli pickle credentials manually (if you already have tokens)

```python
import pickle, os
from google.oauth2.credentials import Credentials

os.makedirs('/root/.local/share/gcalcli', exist_ok=True)
creds = Credentials(
    token=None,
    refresh_token='YOUR_REFRESH_TOKEN',
    token_uri='https://oauth2.googleapis.com/token',
    client_id='YOUR_CLIENT_ID',
    client_secret='YOUR_CLIENT_SECRET',
    scopes=['https://www.googleapis.com/auth/calendar']
)
with open('/root/.local/share/gcalcli/oauth', 'wb') as f:
    pickle.dump(creds, f)
print('Done')
```

## Alternative: Device Flow (no redirect URI needed)

Some tools support device flow — they give you a short code to enter at a URL, no redirect needed:
```bash
gh auth login  # GitHub CLI uses device flow by default
```
Prefer device flow when available — no tunnel needed.

## Example Domains

| Domain | Tool | Port | Notes |
|--------|------|------|-------|
| Google Calendar | gcalcli | 48315 | pickle credentials |
| Google Cloud | gcloud auth login | varies | `--no-launch-browser` flag |
| Spotify | librespot/spotipy | varies | check redirect URI setting |
| Custom OAuth app | any | any free port | same pattern |

## Failure Modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Connection refused` on localhost | Python server not running or wrong port | Check port matches SSH tunnel |
| `redirect_uri_mismatch` from OAuth | Registered URI doesn't match | Add exact `http://localhost:PORT/` to OAuth app |
| Browser gets blank page | Python server stopped before browser hit | Restart capture server, retry |
| Tool hangs after browser redirect | Tool expected to read from server, got nothing | Check Python server is on `0.0.0.0` not `127.0.0.1` |
