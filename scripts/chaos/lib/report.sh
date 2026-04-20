#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Chaos Reporting Library
#
# Sources into chaos scripts to produce structured JSON reports.
# Human-readable output stays on stdout. JSON goes to a file.
# If the script crashes mid-run, the EXIT trap ensures the report is written.
#
# Requires: jq
#
# Provides:
#   report_start <experiment> <service>  — start a new report, set the timer
#   check_pass   <name> <message>        — record a passing check
#   check_fail   <name> <message> <what> <why> [file] [fix] — record a failure
#   report_end                           — write JSON to reports/, print path
#   show_help <usage> <description...>   — print help and exit if -h/--help passed
#
# Usage:
#   source "$(dirname "$0")/lib/report.sh"
#   report_start "pod-kill" "service-a"
#   check_pass "service-reachable" "Service stayed reachable via surviving pod"
#   check_fail "replicas-restored" "Expected 2 replicas, got 1" \
#     "Replacement pod not scheduled" \
#     "K8s scheduler may be under pressure" \
#     "k8s/service-a.yaml" \
#     "Check resource quotas and node capacity"
#   report_end
# ---------------------------------------------------------------------------

REPORT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/reports"

# show_help <flag> <lines...>
# Call early in each script: show_help "${1:-}" "Usage: ..." "" "Description..."
show_help() {
  local flag="$1"; shift
  if [[ "$flag" =~ ^-*h(elp)?$ ]]; then
    printf '%s\n' "$@"
    exit 0
  fi
}

_REPORT_CHECKS="[]"
_REPORT_EXPERIMENT=""
_REPORT_SERVICE=""
_REPORT_START_MS=""

_now_ms() {
  if date --version &>/dev/null 2>&1; then
    date +%s%3N  # GNU
  else
    python3 -c 'import time; print(int(time.time() * 1000))'
  fi
}

report_start() {
  _REPORT_EXPERIMENT="$1"
  _REPORT_SERVICE="$2"
  _REPORT_CHECKS="[]"
  _REPORT_START_MS="$(_now_ms)"
  mkdir -p "$REPORT_DIR"
  trap _report_trap EXIT
}

# check_pass <name> <message>
check_pass() {
  local name="$1"
  local message="$2"

  _REPORT_CHECKS=$(echo "$_REPORT_CHECKS" | jq \
    --arg name "$name" \
    --arg message "$message" \
    '. + [{"name": $name, "passed": true, "message": $message}]')
}

# check_fail <name> <message> <what> <why> [where_file] [fix]
check_fail() {
  local name="$1"
  local message="$2"
  local what="$3"
  local why="$4"
  local where_file="${5:-}"
  local fix="${6:-}"

  local diagnostic
  diagnostic=$(jq -n \
    --arg what "$what" \
    --arg why "$why" \
    --arg where_file "$where_file" \
    --arg fix "$fix" \
    '{what: $what, why: $why} +
     (if $where_file != "" then {where: {file: $where_file}} else {} end) +
     (if $fix != "" then {fix: $fix} else {} end)')

  _REPORT_CHECKS=$(echo "$_REPORT_CHECKS" | jq \
    --arg name "$name" \
    --arg message "$message" \
    --argjson diagnostic "$diagnostic" \
    '. + [{"name": $name, "passed": false, "message": $message, "diagnostic": $diagnostic}]')
}

# Trap to ensure report is written even if the script crashes mid-run
_report_trap() {
  local exit_code=$?
  if [[ -n "$_REPORT_EXPERIMENT" && -n "$_REPORT_START_MS" ]]; then
    # If script crashed (non-zero exit) with no failed checks, add a crash marker
    local has_failures
    has_failures=$(echo "$_REPORT_CHECKS" | jq '[.[] | select(.passed == false)] | length')
    if [[ $exit_code -ne 0 && "$has_failures" -eq 0 ]]; then
      check_fail "script-crash" "Script exited with code $exit_code before completing" \
        "Script crashed before all checks could run" \
        "Check CI logs for the error that caused the early exit"
    fi
    report_end
  fi
}

report_end() {
  # Prevent double-emit from trap
  [[ -z "$_REPORT_START_MS" ]] && return
  local end_ms
  end_ms="$(_now_ms)"
  local duration_ms=$(( end_ms - _REPORT_START_MS ))

  local any_failed
  any_failed=$(echo "$_REPORT_CHECKS" | jq '[.[] | select(.passed == false)] | length > 0')
  local passed=true
  [[ "$any_failed" == "true" ]] && passed=false

  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  local report
  report=$(jq -n \
    --arg experiment "$_REPORT_EXPERIMENT" \
    --arg service "$_REPORT_SERVICE" \
    --arg timestamp "$timestamp" \
    --argjson passed "$passed" \
    --argjson duration_ms "$duration_ms" \
    --argjson checks "$_REPORT_CHECKS" \
    '{
      experiment: $experiment,
      service: $service,
      timestamp: $timestamp,
      passed: $passed,
      duration_ms: $duration_ms,
      checks: $checks
    }')

  local filename="${_REPORT_EXPERIMENT}-${_REPORT_SERVICE}-$(date -u +%Y%m%dT%H%M%SZ).json"
  echo "$report" > "$REPORT_DIR/$filename"
  echo ""
  echo "📄 Report: $REPORT_DIR/$filename"

  # Clear start time to prevent double-emit from trap
  _REPORT_START_MS=""
}
