#!/usr/bin/env bash
# Cursor Cloud: launch dockerd in the background when the VM has no init system.
#
# This cloud VM runs `tini` as PID 1 (no systemd), so `sudo service docker
# start` is a no-op. We start dockerd directly and wait for the socket to
# appear before returning. Idempotent: a no-op if docker is already up.
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not installed yet — run scripts/cloud-install-docker.sh first." >&2
  exit 0
fi

if sudo docker info >/dev/null 2>&1; then
  echo "dockerd already running."
  exit 0
fi

echo "Starting dockerd in the background..."
sudo nohup dockerd >/tmp/dockerd.log 2>&1 &

for _ in $(seq 1 30); do
  if sudo docker info >/dev/null 2>&1; then
    echo "dockerd ready."
    exit 0
  fi
  sleep 1
done

echo "dockerd failed to start within 30s; see /tmp/dockerd.log" >&2
exit 1
