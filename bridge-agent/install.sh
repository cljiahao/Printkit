#!/usr/bin/env bash
# printkit bridge installer for Raspberry Pi OS.
#
# Read this file before running it. It installs BlueZ and the build tools
# the Bluetooth library compiles against, builds the agent, installs it
# under /opt/printkit-bridge, links the printkit-bridge command, and
# registers a systemd service that starts the agent at boot. It does not
# touch anything else on the Pi.
#
#   sudo ./install.sh
#
set -euo pipefail

INSTALL_DIR=/opt/printkit-bridge
SERVICE_USER="${SUDO_USER:-$USER}"
SERVICE_HOME="$(getent passwd "$SERVICE_USER" | cut -d: -f6)"
UNIT_NAME="printkit-bridge@${SERVICE_USER}.service"
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this with sudo: sudo ./install.sh" >&2
  exit 1
fi

if [ "$SERVICE_USER" = "root" ]; then
  echo "Run this with sudo from your normal user, not as root." >&2
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

# The Bluetooth library (noble) builds a native module against BlueZ.
echo "Installing Bluetooth packages and build tools"
apt-get update
apt-get install -y bluetooth bluez libbluetooth-dev libudev-dev \
  build-essential python3

echo "Building the agent"
sudo -u "$SERVICE_USER" sh -c \
  "cd '$SOURCE_DIR' && npm install --no-audit --no-fund && npm run build"

echo "Installing the agent into ${INSTALL_DIR}"
install -d -m 0755 "$INSTALL_DIR"
rm -rf "${INSTALL_DIR}/dist"
cp -R "$SOURCE_DIR/dist" "$SOURCE_DIR/package.json" "$INSTALL_DIR/"
(cd "$INSTALL_DIR" && npm install --omit=dev --no-audit --no-fund)
chmod 0755 "${INSTALL_DIR}/dist/cli.js"
ln -sf "${INSTALL_DIR}/dist/cli.js" /usr/local/bin/printkit-bridge

# The service may only write here, so it has to exist before it starts.
install -d -m 0700 -o "$SERVICE_USER" -g "$SERVICE_USER" \
  "${SERVICE_HOME}/.printkit-bridge"

echo "Registering the service as ${UNIT_NAME}"
install -m 0644 "$SOURCE_DIR/printkit-bridge.service" \
  /etc/systemd/system/printkit-bridge@.service
systemctl daemon-reload
systemctl enable "$UNIT_NAME"

cat <<EOF

Installed. Two steps left, both as ${SERVICE_USER} (not root):

  printkit-bridge pair <code>             # the code printkit showed you
  printkit-bridge use "<printer>" B1      # its Bluetooth name or address

Then start it:

  sudo systemctl start ${UNIT_NAME}
  journalctl -u ${UNIT_NAME} -f

If the printer never connects, see "Troubleshooting" in README.md.

EOF
