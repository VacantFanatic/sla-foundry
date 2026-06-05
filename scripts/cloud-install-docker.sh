#!/usr/bin/env bash
# Cursor Cloud: install docker.io if missing.
#
# This VM image ships without Docker but the cloud-foundry.sh workflow uses
# ghcr.io/felddy/foundryvtt:14 to run Foundry. This script is idempotent and
# safe to call on every install hook — it's a no-op when docker is already
# available.
#
# The base storage driver `overlayfs` does not work when Docker runs on top
# of another overlay filesystem (whiteout files cannot be created); we pin
# the daemon to `vfs` via /etc/docker/daemon.json. vfs is slower but
# correct, and is the only driver that works inside this nested layout.
set -euo pipefail

if command -v docker >/dev/null 2>&1; then
  echo "docker already installed: $(docker --version)"
  exit 0
fi

echo "Installing docker.io via apt..."
sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker.io >/dev/null

sudo mkdir -p /etc/docker
if ! [[ -f /etc/docker/daemon.json ]]; then
  echo '{"storage-driver":"vfs"}' | sudo tee /etc/docker/daemon.json >/dev/null
fi

echo "docker installed: $(docker --version)"
