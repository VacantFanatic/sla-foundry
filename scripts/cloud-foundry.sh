#!/usr/bin/env bash
# Cursor Cloud: prepare/start Foundry for SLA Industries E2E.
# Credentials come from Cloud Agents → Secrets (workspace), not from the repo.
set -euo pipefail

DATA_DIR="${FOUNDRY_DATA_DIR:-/home/ubuntu/foundry-data}"
IMAGE="${FOUNDRY_IMAGE:-ghcr.io/felddy/foundryvtt:14}"
PORT="${FOUNDRY_PORT:-30000}"
WORLD_ID="${FOUNDRY_WORLD_ID:-sla-test-world}"
START_SCRIPT="${FOUNDRY_START_SCRIPT:-/home/ubuntu/start-foundry.sh}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cmd="${1:-status}"

sync_system_install() {
  local dest="$DATA_DIR/Data/systems/sla-industries"
  if [[ -L "$dest" ]] || [[ ! -f "$dest/system.json" ]]; then
    echo "Installing sla-industries system (copy; Foundry v14 does not load symlinked systems reliably)..."
    rm -rf "$dest"
    mkdir -p "$DATA_DIR/Data/systems"
    rsync -a --exclude node_modules --exclude .git "$ROOT/" "$dest/"
  fi
}

ensure_world_json() {
  local world_dir="$DATA_DIR/Data/worlds/$WORLD_ID"
  if [[ -f "$world_dir/world.json" ]]; then
    return 0
  fi
  echo "Creating test world $WORLD_ID..."
  mkdir -p "$world_dir"
  cat >"$world_dir/world.json" <<EOF
{
  "id": "$WORLD_ID",
  "title": "SLA Test World",
  "description": "Cloud agent E2E world for SLA Industries",
  "system": "sla-industries",
  "coreVersion": "14.363",
  "systemVersion": "2.5.0"
}
EOF
}

clear_stale_lock() {
  sudo rm -rf "$DATA_DIR/Config/options.json.lock" 2>/dev/null || true
}

prepare() {
  mkdir -p "$DATA_DIR/Data/systems" "$DATA_DIR/Data/worlds" "$DATA_DIR/container_cache"
  sync_system_install
  ensure_world_json
  if command -v docker >/dev/null 2>&1; then
    sudo docker pull "$IMAGE" >/dev/null 2>&1 || sudo docker pull "$IMAGE"
  fi
  echo "Foundry data ready at $DATA_DIR"
}

has_download_creds() {
  [[ -n "${FOUNDRY_RELEASE_URL:-}" || -n "${FOUNDRY_USERNAME:-}" ]]
}

has_cache_zip() {
  compgen -G "$DATA_DIR/container_cache/foundryvtt-"*.zip >/dev/null 2>&1
}

foundry_listening() {
  curl -sf --max-time 2 "http://127.0.0.1:${PORT}/join" 2>/dev/null | rg -q "Join Game Session" || \
    curl -sf --max-time 2 "http://127.0.0.1:${PORT}/" >/dev/null 2>&1
}

bootstrap_users() {
  if [[ -z "${FOUNDRY_USER:-}" ]]; then
    return 0
  fi
  if ! foundry_listening; then
    return 0
  fi
  node "$ROOT/scripts/ensure-foundry-user.mjs" || true
}

start() {
  prepare
  clear_stale_lock

  if foundry_listening; then
    echo "Foundry already listening on http://127.0.0.1:${PORT}"
    bootstrap_users
    return 0
  fi

  export FOUNDRY_WORLD="${FOUNDRY_WORLD:-$WORLD_ID}"

  if has_download_creds && [[ -x "$START_SCRIPT" ]]; then
    echo "Starting Foundry via credentials (world=$FOUNDRY_WORLD)..."
    "$START_SCRIPT"
  elif has_cache_zip; then
    echo "Starting Foundry from container cache (world=$FOUNDRY_WORLD)..."
    sudo docker rm -f foundry 2>/dev/null || true
    ENV_ARGS=(-e "FOUNDRY_TELEMETRY=false" -e "FOUNDRY_WORLD=${FOUNDRY_WORLD}")
    [[ -n "${FOUNDRY_LICENSE_KEY:-}" ]] && ENV_ARGS+=(-e "FOUNDRY_LICENSE_KEY=${FOUNDRY_LICENSE_KEY}")
    [[ -n "${FOUNDRY_RELEASE_URL:-}" ]] && ENV_ARGS+=(-e "FOUNDRY_RELEASE_URL=${FOUNDRY_RELEASE_URL}")
    sudo docker run -d --name foundry \
      --hostname "${FOUNDRY_DOCKER_HOSTNAME:-foundry-server}" \
      -p "${PORT}:30000" \
      -v "${DATA_DIR}:/data" \
      "${ENV_ARGS[@]}" \
      "$IMAGE"
  else
    echo "Foundry not started: add Cloud Agents secrets (see AGENTS.md)."
    return 0
  fi

  for _ in $(seq 1 120); do
    if foundry_listening; then
      echo "Foundry is up at http://127.0.0.1:${PORT}"
      bootstrap_users
      return 0
    fi
    sleep 2
  done
  echo "Foundry start timed out. sudo docker logs foundry" >&2
  return 1
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
  bootstrap) prepare; bootstrap_users ;;
  *) echo "Usage: $0 {prepare|start|status|bootstrap}" >&2; exit 1 ;;
esac
