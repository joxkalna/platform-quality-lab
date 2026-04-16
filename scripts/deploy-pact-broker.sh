#!/usr/bin/env bash
set -euo pipefail

# Registers environments on the Pact Broker (PactFlow).
# Run once, or idempotently on each deploy.
#
# Usage: ./scripts/deploy-pact-broker.sh

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)/.."

source "$ROOT_DIR/.env"

BROKER_URL="$PACT_BROKER_BASE_URL"
TOKEN="$PACT_BROKER_TOKEN"

echo "=== Pact Broker Setup ==="
echo "  Broker: $BROKER_URL"

# Verify connectivity
echo "→ Checking Broker connectivity..."
if ! curl -sf -H "Authorization: Bearer $TOKEN" "$BROKER_URL/diagnostic/status/heartbeat" >/dev/null 2>&1; then
  echo "ERROR: Cannot reach Broker at $BROKER_URL"
  exit 1
fi
echo "✓ Broker is reachable"

# Register environments
for ENV_NAME in dev prod; do
  if npx pact-broker list-environments \
    --broker-base-url "$BROKER_URL" \
    --broker-token "$TOKEN" 2>/dev/null | grep -q "$ENV_NAME"; then
    echo "✓ Environment '$ENV_NAME' already registered"
  else
    echo "→ Registering '$ENV_NAME' environment..."
    PROD_FLAG=""
    [[ "$ENV_NAME" == "prod" ]] && PROD_FLAG="--production"
    DISPLAY_NAME=$(echo "$ENV_NAME" | awk '{print toupper(substr($0,1,1)) substr($0,2)}')
    npx pact-broker create-environment \
      --name "$ENV_NAME" \
      --display-name "$DISPLAY_NAME" \
      $PROD_FLAG \
      --broker-base-url "$BROKER_URL" \
      --broker-token "$TOKEN"
    echo "✓ Environment '$ENV_NAME' registered"
  fi
done

echo ""
echo "=== Setup Complete ==="
echo "  UI: $BROKER_URL"
