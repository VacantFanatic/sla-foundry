#!/usr/bin/env bash
# Cursor Cloud: prepare/start Foundry for SLA Industries E2E.
# Credentials come from Cloud Agents → Secrets (workspace), not from the repo.
set -euo pipefail

DATA_DIR="${FOUNDRY_DATA_DIR:-/home/ubuntu/foundry-data}"
IMAGE="${FOUNDRY_IMAGE:-ghcr.io/felddy/foundryvtt:14}"
PORT="${FOUNDRY_PORT:-30000}"
START_SCRIPT="${FOUNDRY_START_SCRIPT:-/home/ubuntu/start-foundry.sh}"

cmd="${1:-status}"

prepare() {
  mkdir -p "$DATA_DIR/Data/systems" "$DATA_DIR/container_cache"
  ln -sfn /workspace "$DATA_DIR/Data/systems/sla-industries"
  if command -v docker >/dev/null 2>&1; then
    sudo docker pull "$IMAGE" >/dev/null 2>&1 || sudo docker pull "$IMAGE"
  fi
  echo "Foundry data ready at $DATA_DIR (system → /workspace)"
}

has_download_creds() {
  [[ -n "${FOUNDRY_RELEASE_URL:-}" || -n "${FOUNDRY_USERNAME:-}" ]]
}

has_cache_zip() {
  compgen -G "$DATA_DIR/container_cache/foundryvtt-"*.zip >/dev/null 2>&1
}

foundry_listening() {
  curl -sf --max-time 2 "http://127.0.0.1:${PORT}/" >/dev/null 2>&1
}

start() {
  prepare
  if foundry_listening; then
    echo "Foundry already listening on http://127.0.0.1:${PORT}"
    return 0
  fi

  if has_download_creds && [[ -x "$START_SCRIPT" ]]; then
    echo "Starting Foundry via download credentials..."
    "$START_SCRIPT"
    return $?
  fi

  if has_cache_zip; then
    echo "Starting Foundry from container cache (no release URL)..."
    sudo docker rm -f foundry 2>/dev/null || true
    ENV_ARGS=(-e "FOUNDRY_TELEMETRY=false")
    [[ -n "${FOUNDRY_LICENSE_KEY:-}" ]] && ENV_ARGS+=(-e "FOUNDRY_LICENSE_KEY=${FOUNDRY_LICENSE_KEY}")
    [[ -n "${FOUNDRY_ADMIN_KEY:-}" ]] && ENV_ARGS+=(-e "FOUNDRY_ADMIN_KEY=${FOUNDRY_ADMIN_KEY}")
    sudo docker run -d --name foundry \
      --hostname "${FOUNDRY_DOCKER_HOSTNAME:-foundry-server}" \
      -p "${PORT}:30000" \
      -v "${DATA_DIR}:/data" \
      "${ENV_ARGS[@]}" \
      "$IMAGE"
    for _ in $(seq 1 120); do
      if foundry_listening; then
        echo "Foundry is up at http://127.0.0.1:${PORT}"
        return 0
      fi
      sleep 2
    done
    echo "Foundry cache start timed out. sudo docker logs foundry" >&2
    return 1
  fi

  echo "Foundry not started: add secrets in Cursor → Cloud Agents → Secrets (see AGENTS.md)."
  echo "  Need FOUNDRY_RELEASE_URL or FOUNDRY_USERNAME + FOUNDRY_ACCOUNT_PASSWORD, and usually FOUNDRY_LICENSE_KEY."
  return 0
}

status() {
  if foundry_listening; then
    echo "foundry:up http://127.0.0.1:${PORT}"
    return 0
  fi
  echo "foundry:down"
  return 1
}

case "$cmd" in
  prepare) prepare ;;
  start) start ;;
  status) status ;;
  *) echo "Usage: $0 {prepare|start|status}" >&2; exit 1 ;;
esac
