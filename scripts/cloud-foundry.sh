#!/usr/bin/env bash
# Cursor Cloud: prepare/start Foundry for SLA Industries E2E.
# Credentials come from Cloud Agents → Secrets (workspace), not from the repo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${FOUNDRY_DATA_DIR:-/home/ubuntu/foundry-data}"
IMAGE="${FOUNDRY_IMAGE:-ghcr.io/felddy/foundryvtt:14}"
PORT="${FOUNDRY_PORT:-30000}"
WORLD_ID="${FOUNDRY_WORLD_ID:-sla-test-world}"
START_SCRIPT="${FOUNDRY_START_SCRIPT:-$ROOT/scripts/start-foundry.sh}"
# shellcheck source=ensure-docker.sh
source "$ROOT/scripts/ensure-docker.sh"

cmd="${1:-status}"

sync_system_install() {
  local dest="$DATA_DIR/Data/systems/sla-industries"
  echo "Building dist/ and installing sla-industries into Foundry data..."
  if ! npm run build --prefix "$ROOT"; then
    echo "npm run build failed — cannot deploy dist/ to Foundry." >&2
    exit 1
  fi
  if [[ ! -f "$ROOT/dist/system.json" ]]; then
    echo "dist/system.json missing after build." >&2
    exit 1
  fi
  rm -rf "$dest"
  mkdir -p "$dest"
  cp -a "$ROOT/dist/." "$dest/"
}

ensure_world_json() {
  local world_dir="$DATA_DIR/Data/worlds/$WORLD_ID"
  local sys_version
  sys_version="$(node -p "require('${ROOT}/system.json').version")"
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
  "systemVersion": "${sys_version}"
}
EOF
}

clear_stale_lock() {
  sudo rm -rf "$DATA_DIR/Config/options.json.lock" 2>/dev/null || true
}

prepare() {
  if command -v docker >/dev/null 2>&1; then
    ensure_docker_daemon
  fi
  mkdir -p "$DATA_DIR/Data/systems" "$DATA_DIR/Data/worlds" "$DATA_DIR/container_cache"
  sync_system_install
  ensure_world_json
  if [[ -x "$ROOT/scripts/cache-foundry-release.sh" ]]; then
    "$ROOT/scripts/cache-foundry-release.sh" || true
  fi
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

# Join page is ready — world is running (v14 serves /join as a client app; static HTML only).
foundry_join_ready() {
  local html
  html="$(curl -sf --max-time 2 "http://127.0.0.1:${PORT}/join" 2>/dev/null)" || return 1
  echo "$html" | rg -q 'class="auth join' || return 1
  echo "$html" | rg -qi 'critical failure' && return 1
  return 0
}

# HTTP responds (license, setup, or join) but join may not be ready yet.
foundry_http_up() {
  curl -sf --max-time 2 "http://127.0.0.1:${PORT}/" >/dev/null 2>&1
}

wait_for_join_ready() {
  local attempts="${1:-120}"
  for _ in $(seq 1 "$attempts"); do
    if foundry_join_ready; then
      return 0
    fi
    sleep 2
  done
  return 1
}

run_first_boot_bootstrap() {
  if foundry_join_ready; then
    return 0
  fi
  if ! foundry_http_up; then
    echo "Foundry HTTP not responding — cannot run first-boot bootstrap." >&2
    return 1
  fi
  echo "Foundry HTTP up but /join not ready — running first-boot bootstrap..."
  node "$ROOT/scripts/foundry-bootstrap.mjs"
}

bootstrap_users() {
  if [[ -z "${FOUNDRY_USER:-}" ]]; then
    return 0
  fi
  if ! foundry_join_ready; then
    echo "Skipping user bootstrap — /join is not ready." >&2
    return 0
  fi
  node "$ROOT/scripts/ensure-foundry-user.mjs"
}

start_container() {
  export FOUNDRY_WORLD="${FOUNDRY_WORLD:-$WORLD_ID}"

  if has_download_creds && [[ -x "$START_SCRIPT" ]]; then
    echo "Starting Foundry via credentials (world=$FOUNDRY_WORLD)..."
    "$START_SCRIPT"
    return 0
  fi
  if has_cache_zip; then
    echo "Starting Foundry from container cache (world=$FOUNDRY_WORLD)..."
    sudo docker rm -f foundry 2>/dev/null || true
    ENV_ARGS=(-e "FOUNDRY_TELEMETRY=false" -e "FOUNDRY_WORLD=${FOUNDRY_WORLD}")
    [[ -n "${FOUNDRY_LICENSE_KEY:-}" ]] && ENV_ARGS+=(-e "FOUNDRY_LICENSE_KEY=${FOUNDRY_LICENSE_KEY}")
    [[ -n "${FOUNDRY_RELEASE_URL:-}" ]] && ENV_ARGS+=(-e "FOUNDRY_RELEASE_URL=${FOUNDRY_RELEASE_URL}")
    sudo docker run -d --name foundry \
      --hostname "${FOUNDRY_DOCKER_HOSTNAME:-foundry-server}" \
      --restart unless-stopped \
      -p "${PORT}:30000" \
      -v "${DATA_DIR}:/data" \
      "${ENV_ARGS[@]}" \
      "$IMAGE"
    return 0
  fi
  echo "Foundry not started: add Cloud Agents secrets (see AGENTS.md)." >&2
  return 1
}

finish_start() {
  if ! wait_for_join_ready 120; then
    run_first_boot_bootstrap || true
    if ! wait_for_join_ready 60; then
      echo "Foundry /join not ready after bootstrap. sudo docker logs foundry" >&2
      return 1
    fi
  fi
  echo "Foundry join page ready at http://127.0.0.1:${PORT}"
  bootstrap_users
}

start() {
  prepare
  clear_stale_lock

  if foundry_join_ready; then
    echo "Foundry join page already ready at http://127.0.0.1:${PORT}"
    bootstrap_users
    return 0
  fi

  if foundry_http_up; then
    echo "Foundry HTTP responding but /join not ready..."
    run_first_boot_bootstrap || true
    finish_start
    return $?
  fi

  start_container || return 0

  for _ in $(seq 1 120); do
    if foundry_http_up; then
      run_first_boot_bootstrap || true
      finish_start
      return $?
    fi
    sleep 2
  done
  echo "Foundry start timed out. sudo docker logs foundry" >&2
  return 1
}

status() {
  if foundry_join_ready; then
    echo "foundry:up http://127.0.0.1:${PORT}"
    return 0
  fi
  if foundry_http_up; then
    echo "foundry:starting http://127.0.0.1:${PORT}"
    return 1
  fi
  echo "foundry:down"
  return 1
}

case "$cmd" in
  prepare) prepare ;;
  start) start ;;
  status) status ;;
  bootstrap)
    prepare
    if ! foundry_join_ready; then
      run_first_boot_bootstrap || true
      wait_for_join_ready 60 || {
        echo "Bootstrap failed: /join not ready." >&2
        exit 1
      }
    fi
    bootstrap_users
    ;;
  *) echo "Usage: $0 {prepare|start|status|bootstrap}" >&2; exit 1 ;;
esac
