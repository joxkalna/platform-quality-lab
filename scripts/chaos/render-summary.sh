#!/usr/bin/env bash
set -euo pipefail

# Renders chaos experiment JSON reports as a GitHub Actions step summary.
# Reads all JSON files from the reports directory and outputs markdown.
#
# Usage: ./scripts/chaos/render-summary.sh
# Output goes to stdout — pipe to $GITHUB_STEP_SUMMARY in CI.

REPORT_DIR="$(cd "$(dirname "$0")" && pwd)/reports"

if [[ ! -d "$REPORT_DIR" ]] || [[ -z "$(ls -A "$REPORT_DIR"/*.json 2>/dev/null)" ]]; then
  echo "⚠️ No chaos reports found in $REPORT_DIR"
  exit 0
fi

echo "## 🔥 Chaos Experiment Results"
echo ""

TOTAL_PASSED=0
TOTAL_FAILED=0

for report in "$REPORT_DIR"/*.json; do
  experiment=$(jq -r '.experiment' "$report")
  service=$(jq -r '.service' "$report")
  passed=$(jq -r '.passed' "$report")
  duration=$(jq -r '.duration_ms' "$report")
  timestamp=$(jq -r '.timestamp' "$report")

  if [[ "$passed" == "true" ]]; then
    icon="✅"
    TOTAL_PASSED=$((TOTAL_PASSED + 1))
  else
    icon="❌"
    TOTAL_FAILED=$((TOTAL_FAILED + 1))
  fi

  echo "### ${icon} ${experiment} — ${service}"
  echo ""
  echo "| | |"
  echo "|---|---|"
  echo "| **Duration** | ${duration}ms |"
  echo "| **Timestamp** | ${timestamp} |"
  echo ""

  # Render checks table
  check_count=$(jq '.checks | length' "$report")
  if [[ "$check_count" -gt 0 ]]; then
    echo "| Check | Result | Detail |"
    echo "|---|---|---|"

    jq -r '.checks[] | [.name, (if .passed then "✅" else "❌" end), .message] | @tsv' "$report" | \
      while IFS=$'\t' read -r name result message; do
        echo "| \`${name}\` | ${result} | ${message} |"
      done

    echo ""
  fi

  # Render diagnostics for failures
  failed_checks=$(jq '[.checks[] | select(.passed == false and .diagnostic != null)]' "$report")
  diag_count=$(echo "$failed_checks" | jq 'length')

  if [[ "$diag_count" -gt 0 ]]; then
    echo "<details>"
    echo "<summary>🔍 Diagnostics (${diag_count} issue(s))</summary>"
    echo ""

    echo "$failed_checks" | jq -r '.[] | "**\(.name)**\n- **What:** \(.diagnostic.what)\n- **Why:** \(.diagnostic.why)" + (if .diagnostic.where then "\n- **Where:** `\(.diagnostic.where.file)`" else "" end) + (if .diagnostic.fix then "\n- **Fix:** \(.diagnostic.fix)" else "" end) + "\n"' 

    echo "</details>"
    echo ""
  fi
done

# Summary line
TOTAL=$((TOTAL_PASSED + TOTAL_FAILED))
if [[ "$TOTAL_FAILED" -eq 0 ]]; then
  echo "---"
  echo "**${TOTAL} experiment(s) passed** 🎉"
else
  echo "---"
  echo "**${TOTAL_FAILED} of ${TOTAL} experiment(s) failed** — see diagnostics above."
fi
