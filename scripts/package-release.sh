#!/usr/bin/env bash
# Build dist/ and create sla-industries.zip for Foundry installation.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SYSTEM_ID="sla-industries"
VERSION="$(node -p "require('./system.json').version")"
STAGE="${ROOT}/.package-stage"
ZIP="${ROOT}/${SYSTEM_ID}.zip"

npm run build

rm -rf "$STAGE" "$ZIP"
mkdir -p "$STAGE"
cp -a dist/. "$STAGE/${SYSTEM_ID}/"

(
  cd "$STAGE"
  zip -qr "$ZIP" "$SYSTEM_ID"
)

rm -rf "$STAGE"
echo "Created ${ZIP} (v${VERSION})"
