#!/usr/bin/env bash
# Download Foundry release zip into container_cache for offline / persistent installs.
set -euo pipefail

DATA_DIR="${FOUNDRY_DATA_DIR:-/home/ubuntu/foundry-data}"
CACHE_DIR="$DATA_DIR/container_cache"
IMAGE="${FOUNDRY_IMAGE:-ghcr.io/felddy/foundryvtt:14}"

mkdir -p "$CACHE_DIR"

if compgen -G "${CACHE_DIR}/foundryvtt-"*.zip >/dev/null 2>&1; then
  echo "Foundry release cache present in $CACHE_DIR"
  exit 0
fi

build="$(sudo docker run --rm --entrypoint printenv "$IMAGE" FOUNDRY_VERSION 2>/dev/null || echo "14.363")"
zip_path="${CACHE_DIR}/foundryvtt-${build}.zip"

release_url="${FOUNDRY_RELEASE_URL:-}"
if [[ -n "$release_url" ]]; then
  code="$(curl -sS -o /dev/null -w "%{http_code}" -I -L --max-time 15 "$release_url" || echo "000")"
  if [[ "$code" == "200" || "$code" == "302" ]]; then
    echo "Caching Foundry ${build} release to $zip_path ..."
    curl -fsSL "$release_url" -o "$zip_path"
    echo "Cached $(du -h "$zip_path" | cut -f1) release."
    exit 0
  fi
  echo "FOUNDRY_RELEASE_URL returned HTTP $code (timed URLs expire in minutes)." >&2
fi

echo "No Foundry release in $CACHE_DIR." >&2
echo "Refresh FOUNDRY_RELEASE_URL in Cloud Agents secrets, or add FOUNDRY_USERNAME + FOUNDRY_ACCOUNT_PASSWORD." >&2
exit 1
