#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_DIR"
exec "$SCRIPT_DIR/run-with-lock.sh" "clawtext-daily-cluster-rebuild" 1800 bash -lc "$SCRIPT_DIR/memory-hygiene.sh && node scripts/build-clusters.js && node scripts/validate-rag.js && node scripts/journal-maintenance.mjs --verbose"
