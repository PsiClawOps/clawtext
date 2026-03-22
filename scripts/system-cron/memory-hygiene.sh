#!/usr/bin/env bash
# ClawText Memory Hygiene — Pre-rebuild size check
# Runs before cluster rebuild to monitor memory dir health
#
# Actions:
# 1. Report total memory dir size and file count
# 2. Alert if total exceeds threshold
# 3. List largest files for visibility
#
# No compression, no deletion — files stay readable.
# The incremental rebuild (no --force) handles the performance side.
#
# Usage: ./memory-hygiene.sh

set -euo pipefail

MEMORY_DIR="${CLAWTEXT_MEMORY_DIR:-$HOME/.openclaw/workspace/memory}"
TOTAL_ALERT_MB=200

echo "[memory-hygiene] Memory dir: $MEMORY_DIR"

if [[ ! -d "$MEMORY_DIR" ]]; then
  echo "[memory-hygiene] Memory directory not found, skipping"
  exit 0
fi

# Report total size
TOTAL_SIZE=$(du -sm "$MEMORY_DIR" | cut -f1)
MD_COUNT=$(find "$MEMORY_DIR" -maxdepth 1 -name "*.md" | wc -l)

echo "[memory-hygiene] Total: ${TOTAL_SIZE}MB across ${MD_COUNT} files"

# Alert if over threshold
if (( TOTAL_SIZE > TOTAL_ALERT_MB )); then
  echo "[memory-hygiene] ⚠️  WARNING: Memory dir exceeds ${TOTAL_ALERT_MB}MB (${TOTAL_SIZE}MB)"
fi

# List top 5 largest files
echo "[memory-hygiene] Largest files:"
du -sk "$MEMORY_DIR"/*.md 2>/dev/null | sort -rn | head -5 | while read -r size file; do
  echo "  ${size}KB  $(basename "$file")"
done

echo "[memory-hygiene] Done"
