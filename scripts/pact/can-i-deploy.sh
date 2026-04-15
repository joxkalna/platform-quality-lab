#!/usr/bin/env bash
set -euo pipefail

# Checks if services are safe to deploy, then records deployment.
# Runs after provider verification.
#
# Usage: ./scripts/pact/can-i-deploy.sh

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

source "$ROOT_DIR/.env"

BROKER_URL="$PACT_BROKER_BASE_URL"
TOKEN="$PACT_BROKER_TOKEN"
COMMIT=$(git rev-parse --short=8 HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Determine environment: main → prod, everything else → dev
ENV="dev"
[[ "$BRANCH" == "main" ]] && ENV="prod"

echo "=== Can-I-Deploy ==="
echo "  Environment: $ENV"
echo "  Version:     $COMMIT"

# Check consumer can deploy (has verified pact with provider at this version)
echo "→ Checking service-a can deploy to $ENV..."
npx pact-broker can-i-deploy \
  --pacticipant service-a \
  --version "$COMMIT" \
  --pacticipant service-b \
  --version "$COMMIT" \
  --broker-base-url "$BROKER_URL" \
  --broker-token "$TOKEN"

echo "✓ Safe to deploy"

echo ""
echo "=== Recording Deployments ==="

for SERVICE in service-a service-b; do
  echo "→ Recording $SERVICE deployment to $ENV..."
  npx pact-broker record-deployment \
    --pacticipant "$SERVICE" \
    --version "$COMMIT" \
    --environment "$ENV" \
    --broker-base-url "$BROKER_URL" \
    --broker-token "$TOKEN"
  echo "✓ $SERVICE recorded"
done

echo ""
echo "✓ All services deployed to $ENV"
