#!/usr/bin/env bash
# printkit bridge installer for Raspberry Pi OS.
#
# Read this file before running it. It installs the agent under
# /opt/printkit-bridge and registers a systemd service that starts the
# agent at boot. It does not touch anything else on the Pi.
#
#   sudo ./install.sh
#
set -euo pipefail

INSTALL_DIR=/opt/printkit-bridge
SERVICE_USER="${SUDO_USER:-$USER}"
UNIT_NAME="printkit-bridge@${SERVICE_USER}.service"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this with sudo: sudo ./install.sh" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node is not installed. Install Node 24 or newer first." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "Node ${NODE_MAJOR} is too old. Install Node 24 or newer." >&2
  exit 1
fi

echo "Installing the agent into ${INSTALL_DIR}"
install -d -m 0755 "$INSTALL_DIR"
cp -R ./dist ./package.json "$INSTALL_DIR/"

echo "Installing dependencies"
(cd "$INSTALL_DIR" && npm install --omit=dev --no-audit --no-fund)

echo "Registering the service as ${UNIT_NAME}"
install -m 0644 ./printkit-bridge.service \
  /etc/systemd/system/printkit-bridge@.service
systemctl daemon-reload
systemctl enable "$UNIT_NAME"

cat <<EOF

Installed. Two steps left, both as ${SERVICE_USER} (not root):

  printkit-bridge pair <code>        # the code printkit showed you
  printkit-bridge use "<printer>"    # the Bluetooth name of your printer

Then start it:

  sudo systemctl start ${UNIT_NAME}
  systemctl status ${UNIT_NAME}

EOF
