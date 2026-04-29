#!/usr/bin/env bash
# Download the latest dashboard-data artifact from a previous workflow run.
# Uses GitHub REST API directly — no third-party actions.
#
# Required env vars (all available in GitHub Actions by default):
#   GITHUB_TOKEN — automatic token
#   GITHUB_REPOSITORY — owner/repo
#   GITHUB_API_URL — https://api.github.com
#
# Output: docs/dashboard/trend.json and docs/dashboard/chaos-trend.json
# If no previous artifact exists, creates empty arrays (first run bootstrap).

set -euo pipefail

ARTIFACT_NAME="dashboard-data"
OUTPUT_DIR="docs/dashboard"
mkdir -p "$OUTPUT_DIR"

echo "🔍 Looking for previous '$ARTIFACT_NAME' artifact..."

# Find the latest artifact with this name
RESPONSE=$(curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/actions/artifacts?name=$ARTIFACT_NAME&per_page=1")

DOWNLOAD_URL=$(echo "$RESPONSE" | jq -r '.artifacts[0].archive_download_url // empty')

if [ -z "$DOWNLOAD_URL" ]; then
  echo "⚠️ No previous artifact found — starting fresh."
  echo "[]" > "$OUTPUT_DIR/trend.json"
  echo "[]" > "$OUTPUT_DIR/chaos-trend.json"
  exit 0
fi

echo "⬇️ Downloading artifact..."
curl -s -L -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -o /tmp/dashboard-data.zip "$DOWNLOAD_URL"

echo "📦 Extracting..."
unzip -o -q /tmp/dashboard-data.zip -d "$OUTPUT_DIR"
rm -f /tmp/dashboard-data.zip

echo "✅ Previous trend data restored:"
echo "   trend.json: $(jq length "$OUTPUT_DIR/trend.json") entries"
echo "   chaos-trend.json: $(jq length "$OUTPUT_DIR/chaos-trend.json") entries"
