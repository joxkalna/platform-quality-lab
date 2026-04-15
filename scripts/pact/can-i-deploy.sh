#!/usr/bin/env bash
set -euo pipefail

# Checks if all pacticipants are safe to deploy, then records deployment.
# Runs after provider verification — both consumer and provider must be checked.
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

for SERVICE in service-a service-b; do
  echo "→ Checking $SERVICE..."
  npx pact-broker can-i-deploy \
    --pacticipant "$SERVICE" \
    --version "$COMMIT" \
    --to-environment "$ENV" \
    --broker-base-url "$BROKER_URL" \
    --broker-token "$TOKEN" \
    --retry-while-unknown 5 \
    --retry-interval 10
  echo "✓ $SERVICE is safe to deploy to $ENV"
done

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
