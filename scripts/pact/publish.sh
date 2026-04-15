#!/usr/bin/env bash
set -euo pipefail

# Publishes pact files to the Pact Broker, runs can-i-deploy, and records deployment.
# CI only — blocked locally.
#
# Usage: ./scripts/pact/publish.sh

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PACTS_DIR="$ROOT_DIR/tests/pacts"

source "$ROOT_DIR/.env"

BROKER_URL="$PACT_BROKER_BASE_URL"
TOKEN="$PACT_BROKER_TOKEN"

if [[ "${CI:-}" != "true" ]]; then
  echo "ERROR: Pact publishing is only allowed from CI."
  echo "Run 'npm run test:pact' locally to generate and validate pact files."
  exit 1
fi

COMMIT=$(git rev-parse --short=8 HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Determine environment: main → prod, everything else → dev
ENV="dev"
[[ "$BRANCH" == "main" ]] && ENV="prod"

if [[ ! -d "$PACTS_DIR" ]] || [[ -z "$(ls -A "$PACTS_DIR"/*.json 2>/dev/null)" ]]; then
  echo "ERROR: No pact files found in $PACTS_DIR"
  echo "Run 'npm run test:pact' first to generate pact files."
  exit 1
fi

echo "=== Publish Pacts ==="
echo "  Broker:      $BROKER_URL"
echo "  Version:     $COMMIT"
echo "  Branch:      $BRANCH"
echo "  Environment: $ENV"

# 1. Publish pacts
npx pact-broker publish "$PACTS_DIR" \
  --broker-base-url "$BROKER_URL" \
  --broker-token "$TOKEN" \
  --consumer-app-version "$COMMIT" \
  --branch "$BRANCH"

echo "✓ Pacts published"

# 2. Can-i-deploy gate
echo "→ Checking can-i-deploy for service-a to $ENV..."
npx pact-broker can-i-deploy \
  --pacticipant service-a \
  --version "$COMMIT" \
  --to-environment "$ENV" \
  --broker-base-url "$BROKER_URL" \
  --broker-token "$TOKEN" \
  --retry-while-unknown 5 \
  --retry-interval 10

echo "✓ Safe to deploy"

# 3. Record deployment
echo "→ Recording deployment of service-a to $ENV..."
npx pact-broker record-deployment \
  --pacticipant service-a \
  --version "$COMMIT" \
  --environment "$ENV" \
  --broker-base-url "$BROKER_URL" \
  --broker-token "$TOKEN"

echo "✓ Deployment recorded"
echo ""
echo "Broker UI: $BROKER_URL"
