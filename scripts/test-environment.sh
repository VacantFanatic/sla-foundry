#!/usr/bin/env bash
# Run the standard cloud environment verification suite.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== SLA Industries environment test ==="

npm run build
npm run test:unit

if bash scripts/cloud-foundry.sh status >/dev/null 2>&1; then
  echo "=== Foundry is up — running E2E ==="
  if [[ -z "${FOUNDRY_USER:-}" ]]; then
    echo "WARN: FOUNDRY_USER not set; authenticated E2E specs will skip."
  fi
  npm run test:e2e
else
  echo "=== Foundry not running — skipping E2E (unit + build passed) ==="
  bash scripts/cloud-foundry.sh start || true
  if bash scripts/cloud-foundry.sh status >/dev/null 2>&1; then
    echo "Foundry came up after start; running E2E..."
    npm run test:e2e
  else
    echo "E2E skipped. Configure Cloud Agents secrets or save a VM snapshot with Foundry installed."
  fi
fi

echo "=== Environment test complete ==="
