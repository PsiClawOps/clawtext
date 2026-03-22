#!/usr/bin/env bash
# ClawText Memory Hygiene — Pre-rebuild maintenance
# Runs before cluster rebuild to keep memory dir manageable
#
# Actions:
# 1. Compress memory files >7 days old AND >50KB (gzip, keep .md.gz)
# 2. Report total memory dir size
# 3. Alert if total exceeds threshold
#
# Usage: ./memory-hygiene.sh [--dry-run]

set -euo pipefail

MEMORY_DIR="${CLAWTEXT_MEMORY_DIR:-$HOME/.openclaw/workspace/memory}"
MAX_AGE_DAYS=7
MAX_FILE_KB=50
TOTAL_ALERT_MB=200
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

echo "[memory-hygiene] Starting memory hygiene pass"
echo "[memory-hygiene] Memory dir: $MEMORY_DIR"

if [[ ! -d "$MEMORY_DIR" ]]; then
  echo "[memory-hygiene] Memory directory not found, skipping"
  exit 0
fi

# 1. Compress old large files
COMPRESSED=0
SKIPPED=0

for file in "$MEMORY_DIR"/*.md; do
  [[ -f "$file" ]] || continue
  
  filename=$(basename "$file")
  
  # Skip non-date files (MEMORY.md, etc.)
  if [[ ! "$filename" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2} ]]; then
    continue
  fi
  
  # Skip if already has a .gz companion
  if [[ -f "${file}.gz" ]]; then
    continue
  fi
  
  # Check age
  file_age_days=$(( ($(date +%s) - $(stat -c %Y "$file")) / 86400 ))
  if (( file_age_days < MAX_AGE_DAYS )); then
    continue
  fi
  
  # Check size
  file_size_kb=$(( $(stat -c %s "$file") / 1024 ))
  if (( file_size_kb < MAX_FILE_KB )); then
    continue
  fi
  
  if $DRY_RUN; then
    echo "[memory-hygiene] DRY-RUN: Would compress $filename (${file_size_kb}KB, ${file_age_days}d old)"
    COMPRESSED=$((COMPRESSED + 1))
  else
    echo "[memory-hygiene] Compressing $filename (${file_size_kb}KB, ${file_age_days}d old)"
    gzip -k "$file"  # keep original, create .gz alongside
    COMPRESSED=$((COMPRESSED + 1))
  fi
done

echo "[memory-hygiene] Compressed: $COMPRESSED files"

# 2. Report total size
TOTAL_SIZE=$(du -sm "$MEMORY_DIR" | cut -f1)
echo "[memory-hygiene] Total memory dir: ${TOTAL_SIZE}MB"

# 3. Alert if over threshold
if (( TOTAL_SIZE > TOTAL_ALERT_MB )); then
  echo "[memory-hygiene] ⚠️  WARNING: Memory dir exceeds ${TOTAL_ALERT_MB}MB threshold (${TOTAL_SIZE}MB)"
  echo "[memory-hygiene] Consider: trash old compressed files, review ingested data, or increase threshold"
fi

# 4. Count files by category
MD_COUNT=$(find "$MEMORY_DIR" -maxdepth 1 -name "*.md" | wc -l)
GZ_COUNT=$(find "$MEMORY_DIR" -maxdepth 1 -name "*.md.gz" | wc -l)
echo "[memory-hygiene] Files: ${MD_COUNT} .md, ${GZ_COUNT} .md.gz"

echo "[memory-hygiene] Done"
