#!/bin/bash
# SessionStart hook for Claude Code on the web.
# Installs JS deps and (best-effort) prepares/starts the Foundry VTT test
# instance, mirroring what .cursor/environment.json does for Cursor Cloud.
# Docker and Playwright's Chromium are already provided by this environment
# image, so this only fills in what's missing.
set -euo pipefail

# Foundry/E2E setup only matters for remote (web) sessions.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
    exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# --- Core JS toolchain (needed for build/format/unit tests regardless of Foundry) ---
npm install

chmod +x scripts/*.sh

# --- System packages scripts/cloud-foundry.sh needs (curl, ripgrep, docker) ---
SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
fi

missing_pkgs=()
command -v rg >/dev/null 2>&1 || missing_pkgs+=(ripgrep)
command -v curl >/dev/null 2>&1 || missing_pkgs+=(curl)
command -v docker >/dev/null 2>&1 || missing_pkgs+=(docker.io)

if [ "${#missing_pkgs[@]}" -gt 0 ]; then
    $SUDO apt-get update -qq
    $SUDO apt-get install -y -qq "${missing_pkgs[@]}"
fi

# --- Foundry VTT (paid product) — only does anything once FOUNDRY_USERNAME/
# FOUNDRY_ACCOUNT_PASSWORD (or FOUNDRY_RELEASE_URL) are configured as env vars
# on this Claude Code environment. Both steps already no-op safely without
# them, but wrap in `|| true` too so a transient Docker/network hiccup never
# blocks the rest of the session from starting.
export FOUNDRY_DATA_DIR="${FOUNDRY_DATA_DIR:-/root/foundry-data}"

bash scripts/ensure-docker.sh || true
bash scripts/cloud-foundry.sh prepare || echo "Foundry prepare skipped (ok if FOUNDRY_* env vars aren't set yet)."
bash scripts/cloud-foundry.sh start || echo "Foundry start skipped (ok if FOUNDRY_* env vars aren't set yet)."
