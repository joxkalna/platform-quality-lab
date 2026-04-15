#!/usr/bin/env bash
set -euo pipefail

# Publishes pact files to the Pact Broker.
# Run after consumer pact tests generate the pact JSON files.
#
# Usage: ./scripts/pact/publish.sh

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BROKER_URL="${PACT_BROKER_URL:-http://localhost:30080}"
PACTS_DIR="$ROOT_DIR/tests/pacts"

source "$ROOT_DIR/.env"

if [[ "${CI:-}" != "true" ]]; then
  echo "ERROR: Pact publishing is only allowed from CI."
  echo "Run 'npm run test:pact' locally to generate and validate pact files."
  exit 1
fi

COMMIT=$(git rev-parse --short=8 HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [[ ! -d "$PACTS_DIR" ]] || [[ -z "$(ls -A "$PACTS_DIR"/*.json 2>/dev/null)" ]]; then
  echo "ERROR: No pact files found in $PACTS_DIR"
  echo "Run 'npm run test:pact' first to generate pact files."
  exit 1
fi

echo "=== Publish Pacts ==="
echo "  Broker:  $BROKER_URL"
echo "  Version: $COMMIT"
echo "  Branch:  $BRANCH"
echo "  Pacts:   $PACTS_DIR"

npx pact-broker publish "$PACTS_DIR" \
  --broker-base-url "$BROKER_URL" \
  --broker-username "$PACT_BROKER_AUTH_USERNAME" \
  --broker-password "$PACT_BROKER_AUTH_PASSWORD" \
  --consumer-app-version "$COMMIT" \
  --branch "$BRANCH"

echo ""
echo "✓ Pacts published. Check the Broker UI: $BROKER_URL"
