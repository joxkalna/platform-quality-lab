#!/usr/bin/env bash
set -euo pipefail

# Initialises a provider on the Pact Broker.
# One-time setup per provider — gives can-i-deploy a green baseline.
#
# Usage: ./scripts/pact/initialise-provider.sh <provider-name>
# Example: ./scripts/pact/initialise-provider.sh service-b

PROVIDER="${1:?Usage: $0 <provider-name>}"
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BROKER_URL="${PACT_BROKER_URL:-http://localhost:30080}"

source "$ROOT_DIR/.env"

COMMIT=$(git rev-parse --short=8 HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo "=== Initialise Provider: $PROVIDER ==="
echo "  Broker:  $BROKER_URL"
echo "  Version: $COMMIT"
echo "  Branch:  $BRANCH"

# 1. Register the provider with a version and branch
echo "→ Creating provider version..."
npx pact-broker create-or-update-pacticipant \
  --name "$PROVIDER" \
  --broker-base-url "$BROKER_URL" \
  --broker-username "$PACT_BROKER_AUTH_USERNAME" \
  --broker-password "$PACT_BROKER_AUTH_PASSWORD"

echo "✓ Provider '$PROVIDER' registered"

# 2. Record deployment to 'local' environment
echo "→ Recording deployment to 'local'..."
npx pact-broker record-deployment \
  --pacticipant "$PROVIDER" \
  --version "$COMMIT" \
  --environment local \
  --broker-base-url "$BROKER_URL" \
  --broker-username "$PACT_BROKER_AUTH_USERNAME" \
  --broker-password "$PACT_BROKER_AUTH_PASSWORD"

echo "✓ Deployment recorded for 'local'"

echo ""
echo "=== Initialisation Complete ==="
echo "  Broker UI: $BROKER_URL"
echo "  Provider '$PROVIDER' is ready for consumer pacts."
