#!/usr/bin/env bash
# Start Foundry VTT in Docker with persistent data under FOUNDRY_DATA_DIR.
# Used by scripts/cloud-foundry.sh on Cursor Cloud VMs.
set -euo pipefail

DATA_DIR="${FOUNDRY_DATA_DIR:-/home/ubuntu/foundry-data}"
IMAGE="${FOUNDRY_IMAGE:-ghcr.io/felddy/foundryvtt:14}"
PORT="${FOUNDRY_PORT:-30000}"
HOSTNAME="${FOUNDRY_DOCKER_HOSTNAME:-foundry-server}"
WORLD="${FOUNDRY_WORLD:-${FOUNDRY_WORLD_ID:-sla-test-world}}"

has_account_creds() {
  [[ -n "${FOUNDRY_USERNAME:-}" && -n "${FOUNDRY_ACCOUNT_PASSWORD:-}" ]]
}

has_cache_zip() {
  compgen -G "${DATA_DIR}/container_cache/foundryvtt-"*.zip >/dev/null 2>&1
}

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found — install docker.io first." >&2
  exit 1
fi

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

ensure_docker_daemon

mkdir -p "$DATA_DIR/container_cache" "$DATA_DIR/Data/systems" "$DATA_DIR/Data/worlds"

ENV_ARGS=(
  -e "FOUNDRY_TELEMETRY=false"
  -e "FOUNDRY_WORLD=${WORLD}"
  -e "CONTAINER_CACHE=/data/container_cache"
  -e "CONTAINER_PRESERVE_CONFIG=true"
)

[[ -n "${FOUNDRY_LICENSE_KEY:-}" ]] && ENV_ARGS+=(-e "FOUNDRY_LICENSE_KEY=${FOUNDRY_LICENSE_KEY}")
[[ -n "${FOUNDRY_USERNAME:-}" ]] && ENV_ARGS+=(-e "FOUNDRY_USERNAME=${FOUNDRY_USERNAME}")
[[ -n "${FOUNDRY_ACCOUNT_PASSWORD:-}" ]] && ENV_ARGS+=(-e "FOUNDRY_PASSWORD=${FOUNDRY_ACCOUNT_PASSWORD}")

# Warm release cache before starting (timed URL only; account creds download inside the container).
root="$(cd "$(dirname "$0")/.." && pwd)"
if ! has_cache_zip && ! has_account_creds; then
  "$root/scripts/cache-foundry-release.sh" || true
fi

# Felddy precedence: RELEASE_URL → USERNAME/PASSWORD → CACHE. Never pass an expired URL when
# account creds are available — it blocks the username login path.
if ! has_cache_zip; then
  if has_account_creds; then
    echo "Using foundryvtt.com account credentials for first-time download."
  elif [[ -n "${FOUNDRY_RELEASE_URL:-}" ]]; then
    ENV_ARGS+=(-e "FOUNDRY_RELEASE_URL=${FOUNDRY_RELEASE_URL}")
  else
    echo "No cached release and no download credentials." >&2
    echo "Add FOUNDRY_USERNAME + FOUNDRY_ACCOUNT_PASSWORD in Cloud Agents secrets, then restart the agent." >&2
    exit 1
  fi
fi

echo "Pulling ${IMAGE}..."
sudo docker pull "$IMAGE"

sudo docker rm -f foundry 2>/dev/null || true

echo "Starting Foundry (world=${WORLD}, data=${DATA_DIR})..."
sudo docker run -d --name foundry \
  --hostname "$HOSTNAME" \
  --restart unless-stopped \
  -p "${PORT}:30000" \
  -v "${DATA_DIR}:/data" \
  "${ENV_ARGS[@]}" \
  "$IMAGE"
