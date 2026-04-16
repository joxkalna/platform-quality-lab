#!/usr/bin/env bash
set -euo pipefail

# Initialises a provider on the Pact Broker.
# One-time setup per provider — gives can-i-deploy a green baseline.
#
# Usage: ./scripts/pact/initialise-provider.sh <provider-name>
# Example: ./scripts/pact/initialise-provider.sh service-b

PROVIDER="${1:?Usage: $0 <provider-name>}"
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

source "$ROOT_DIR/.env"

BROKER_URL="$PACT_BROKER_BASE_URL"
TOKEN="$PACT_BROKER_TOKEN"
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
  --broker-token "$TOKEN"

# Create the version with branch tag
npx pact-broker create-version-tag \
  --pacticipant "$PROVIDER" \
  --version "$COMMIT" \
  --tag "$BRANCH" \
  --auto-create-version \
  --broker-base-url "$BROKER_URL" \
  --broker-token "$TOKEN"

echo "✓ Provider '$PROVIDER' registered (version: $COMMIT, branch: $BRANCH)"

# 2. Record deployment to all environments (green baseline)
for ENV_NAME in dev prod; do
  echo "→ Recording deployment to '$ENV_NAME'..."
  npx pact-broker record-deployment \
    --pacticipant "$PROVIDER" \
    --version "$COMMIT" \
    --environment "$ENV_NAME" \
    --broker-base-url "$BROKER_URL" \
    --broker-token "$TOKEN"
  echo "✓ Deployment recorded for '$ENV_NAME'"
done

echo ""
echo "=== Initialisation Complete ==="
echo "  Broker UI: $BROKER_URL"
echo "  Provider '$PROVIDER' is ready for consumer pacts."
