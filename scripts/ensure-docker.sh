#!/usr/bin/env bash
# Start the Docker daemon on Cursor Cloud VMs (no systemd; vfs storage on nested hosts).
set -euo pipefail

ensure_docker_daemon() {
  if sudo docker info >/dev/null 2>&1; then
    return 0
  fi
  if command -v service >/dev/null 2>&1; then
    sudo service docker start 2>/dev/null || true
    sudo docker info >/dev/null 2>&1 && return 0
  fi
  # vfs avoids overlayfs whiteout failures on nested cloud VMs.
  if [[ ! -f /etc/docker/daemon.json ]]; then
    sudo mkdir -p /etc/docker
    echo '{"storage-driver":"vfs"}' | sudo tee /etc/docker/daemon.json >/dev/null
  fi
  sudo dockerd >/tmp/dockerd.log 2>&1 &
  for _ in $(seq 1 30); do
    sudo docker info >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "Docker daemon failed to start — see /tmp/dockerd.log" >&2
  return 1
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  ensure_docker_daemon
fi
