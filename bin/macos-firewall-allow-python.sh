#!/usr/bin/env bash
# bin/macos-firewall-allow-python.sh — one-shot: punch a hole in the
# macOS Application Firewall for the Python interpreter that uv uses
# to run uvicorn, so phones / tablets / second laptops on the same LAN
# can reach http://<your-mac-ip>:5003/viewer.
#
# Why this is needed
# ------------------
# macOS' built-in firewall (Application Firewall, not pf) blocks
# incoming connections to unsigned binaries by default. Python from
# python.org / Homebrew / uv isn't Apple-signed for "accept incoming
# connections", so even though uvicorn binds 0.0.0.0:5003 the OS
# silently drops the SYN from 192.168.x.x. The first incoming
# connection normally pops a dialog; that dialog dies under most
# headless flows. Pre-adding the allow rule with socketfilterfw
# survives a reboot and avoids the dialog altogether.
#
# Idempotent: re-running it is harmless. Needs sudo (Apple's CLI).
set -euo pipefail

FW=/usr/libexec/ApplicationFirewall/socketfilterfw

if [[ ! -x "$FW" ]]; then
  echo "✗ $FW not found — is this macOS?" >&2
  exit 1
fi

# Resolve the actual python binary uv uses. uv keeps the interpreter
# under ~/.local/share/uv/python — and may pin a different version per
# project, so resolve via the project venv's symlink rather than $PATH.
VENV_PY="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.venv/bin/python"
if [[ ! -x "$VENV_PY" ]]; then
  echo "✗ no project .venv yet — run 'uv sync' or bin/start-local.sh first" >&2
  exit 1
fi
PY_REAL="$(readlink -f "$VENV_PY" 2>/dev/null || readlink "$VENV_PY")"
PY_REAL="${PY_REAL:-$VENV_PY}"

echo "→ Python interpreter: $PY_REAL"
echo "→ Adding to firewall allow list (may prompt for sudo password)…"

sudo "$FW" --setglobalstate on >/dev/null
sudo "$FW" --add "$PY_REAL"
sudo "$FW" --unblockapp "$PY_REAL"

# State check
sudo "$FW" --getappblocked "$PY_REAL"

cat <<EOF

✓ Done.

Test from another device on the same network:
  curl http://$(ipconfig getifaddr en0 2>/dev/null || echo '<your-mac-ip>'):5003/health

If it still hangs, the second-most-common cause is the macOS Wi-Fi
"private address" feature randomising the laptop's IP between sessions
— pin the address in System Settings → Wi-Fi → (network) → Details.
EOF
