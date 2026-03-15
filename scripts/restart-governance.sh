#!/usr/bin/env bash
set -euo pipefail

# Restart governance wrapper (safe-by-default)
# Usage:
#   restart-governance.sh --plan
#   restart-governance.sh                      # stage request (no execution)
#   restart-governance.sh --live                # execute staged command
#   restart-governance.sh --live --assume-yes    # execute staged command non-interactive
#   restart-governance.sh --live --force          # emergency override
#   RESTART_GOV_COMMAND='openclaw gateway restart' restart-governance.sh --live

CONFIG=${RESTART_GOV_CONFIG:-$HOME/.clawhub/restart-governance.json}
STATE_DIR=${RESTART_GOV_STATE_DIR:-$HOME/.openclaw/workspace/state}
LOG="$STATE_DIR/restart-audit.jsonl"
STAGE_FILE="$STATE_DIR/restart-stage-request.json"
COMMAND="${RESTART_GOV_COMMAND:-}"
FORCE=0
PLAN=0
LIVE=0
ASSUME_YES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --plan)
      PLAN=1
      ;;
    --force)
      FORCE=1
      ;;
    --live)
      LIVE=1
      ;;
    --assume-yes)
      ASSUME_YES=1
      ;;
    --command)
      shift
      COMMAND="$1"
      ;;
    --)
      shift
      break
      ;;
    *)
      echo "Unknown arg: $1"
      echo "Usage: restart-governance.sh [--plan] [--live] [--force] [--assume-yes] [--command \"...\"]"
      exit 2
      ;;
  esac
  shift
done

mkdir -p "$STATE_DIR"
mkdir -p "$(dirname "$CONFIG")"

if [ ! -f "$CONFIG" ]; then
cat > "$CONFIG" <<'EOF'
{
  "announce_pre": "⏳ Gateway restart requested. Running pre-flight checks...",
  "announce_post": "✅ Gateway is back online. Restart complete.",
  "announce_blocked": "⚠️ Restart blocked by pre-flight checks.",
  "announce_staged": "🧪 Restart staged. Execute with --live when ready.",
  "command_default": "openclaw gateway restart"
}
EOF
fi

json_quote() {
  python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'
}

append_log() {
  local event="$1"
  local ts
  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  echo "{\"ts\":\"$ts\",\"event\":$event}" >> "$LOG"
}

announce() {
  local msg="$1"
  echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] $msg"
}

announce_json() {
  local key="$1"
  if command -v jq >/dev/null 2>&1; then
    jq -r ".${key}" "$CONFIG"
  else
    case "$key" in
      announce_pre) echo "⏳ Gateway restart requested. Running pre-flight checks..." ;;
      announce_post) echo "✅ Gateway is back online. Restart complete." ;;
      announce_blocked) echo "⚠️ Restart blocked by pre-flight checks." ;;
      announce_staged) echo "🧪 Restart staged. Execute with --live when ready." ;;
      command_default) echo "openclaw gateway restart" ;;
    esac
  fi
}

check_inflight() {
  local risk=0
  local reasons=""
  local active=0

  if [ -d "$HOME/.openclaw/agents" ]; then
    active=$(find "$HOME/.openclaw/agents" -type f -mmin -10 | wc -l | tr -d '[:space:]')
    if [ "$active" -gt 20 ]; then
      risk=1
      reasons="high-agent-activity"
    fi
  fi

  if [ -f "$HOME/.openclaw/gateway.lock" ]; then
    risk=1
    if [ -n "$reasons" ]; then
      reasons="$reasons,gateway-lock-present"
    else
      reasons="gateway-lock-present"
    fi
  fi

  if [ "$risk" -ne 0 ]; then
    printf '{"status":"blocked","risk":1,"active":%s,"reasons":"%s","force_required":true}\n' "$active" "$reasons"
    return 1
  fi

  printf '{"status":"ok","risk":0,"active":%s,"reasons":"","force_required":false}\n' "$active"
  return 0
}

make_stage_file() {
  local checks="$1"
  local ts
  local actor="${RESTART_GOV_ACTOR:-operator}"
  local reason="${RESTART_GOV_REASON:-manual-override}"
  local source="${RESTART_GOV_SOURCE:-script}"
  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  cat > "$STAGE_FILE" <<EOF
{
  "stagedAt": "$ts",
  "actor": "$actor",
  "reason": "$reason",
  "source": "$source",
  "checks": $checks,
  "requirement": "plan-and-live"
}
EOF
}

require_stage_for_live() {
  if [ "$FORCE" -eq 1 ]; then
    return 0
  fi
  if [ "$LIVE" -eq 1 ] && [ ! -f "$STAGE_FILE" ]; then
    echo "Live mode requires staged request file: $STAGE_FILE"
    echo "Run first: $0 (default) to stage approval, then: $0 --live"
    append_log '{"decision":"blocked","reason":"no-stage-file"}'
    exit 4
  fi
}

run_command() {
  local cmd="$1"
  if [ -z "$cmd" ]; then
    echo "(no command configured)"
    append_log '{"action":"noop","result":"success"}'
    return 0
  fi

  local start_ts end_ts dur cmd_rc
  local cmd_json
  start_ts=$(date -u +%s)
  cmd_json=$(printf '%s' "$cmd" | json_quote)

  append_log "{\"type\":\"command-start\",\"command\":$cmd_json,\"stage_file\":\"$STAGE_FILE\"}"
  echo "[governance] executing: $cmd"

  set +e
  bash -lc "$cmd"
  cmd_rc=$?
  set -e

  end_ts=$(date -u +%s)
  dur=$((end_ts-start_ts))
  append_log "{\"type\":\"command-result\",\"command\":$cmd_json,\"exit_code\":$cmd_rc,\"duration_s\":$dur}"

  if [ "$cmd_rc" -ne 0 ]; then
    echo "command failed with code $cmd_rc"
    append_log '{"decision":"command-failed"}'
    exit $cmd_rc
  fi
}

announce "$(announce_json announce_pre)"
CHECKS=$(check_inflight)
CHECK_STATUS=$?

if [ "$PLAN" -eq 1 ]; then
  append_log "{\"decision\":\"plan\",\"checks\":$CHECKS}"
  echo "$CHECKS"
  echo "Plan mode: checks only. Use default mode to stage or --live for approved execution."
  exit "$CHECK_STATUS"
fi

if [ "$CHECK_STATUS" -ne 0 ] && [ "$FORCE" -ne 1 ]; then
  echo "$(announce_json announce_blocked)"
  echo "Blocked checks: $CHECKS"
  append_log "{\"decision\":\"blocked\",\"checks\":$CHECKS}"
  exit 2
fi

if [ "$CHECK_STATUS" -ne 0 ] && [ "$FORCE" -eq 1 ]; then
  echo "Force flag set. Continuing despite checks: $CHECKS"
  append_log "{\"decision\":\"forced\",\"checks\":$CHECKS}"
fi

if [ "$LIVE" -eq 0 ]; then
  make_stage_file "$CHECKS"
  announce "$(announce_json announce_staged)"
  append_log '{"decision":"staged","result":"created-stage-file"}'
  echo "Restart/maintenance execution staged. Run with --live when ready."
  exit 0
fi

require_stage_for_live

if [ "$ASSUME_YES" -ne 1 ] && [ "$FORCE" -ne 1 ]; then
  read -r -p "Proceed with execution now? Type 'yes' to continue: " confirm
  if [ "$confirm" != "yes" ]; then
    echo "Cancelled by operator."
    append_log '{"decision":"cancelled","reason":"operator-confirm"}'
    exit 3
  fi
fi

if [ -z "$COMMAND" ]; then
  if command -v jq >/dev/null 2>&1; then
    COMMAND=$(jq -r '.command_default' "$CONFIG")
  else
    COMMAND="$(announce_json command_default)"
  fi
fi

append_log '{"decision":"confirmed","message":"Execution approved"}'
run_command "$COMMAND"
append_log '{"decision":"completed","message":"Execution completed"}'
announce "$(announce_json announce_post)"

if [ -f "$STAGE_FILE" ]; then
  rm -f "$STAGE_FILE"
fi

echo "Done."
exit 0
