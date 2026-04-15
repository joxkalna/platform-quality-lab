#!/usr/bin/env bash
set -euo pipefail

# Deploys Pact Broker + Postgres to the Kind cluster.
# Requires: Kind cluster running (./scripts/deploy-local.sh), .env file populated.
#
# What it does:
#   1. Checks the Kind cluster exists
#   2. Pre-loads the Broker image into Kind (VPN blocks pulls inside nodes)
#   3. Creates the K8s Secret from .env
#   4. Deploys Postgres, waits for ready
#   5. Deploys Pact Broker, waits for ready
#   6. Verifies the Broker is healthy via heartbeat
#   7. Registers the 'local' environment on the Broker

CLUSTER_NAME="platform-lab"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BROKER_URL="http://localhost:30080"
BROKER_IMAGE="pactfoundation/pact-broker:2.102.2.0"

echo "=== Pact Broker Deploy ==="

# 1. Check cluster exists
if ! kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
  echo "ERROR: Kind cluster '${CLUSTER_NAME}' not found."
  echo "Run ./scripts/deploy-local.sh first to create the cluster."
  exit 1
fi

# 2. Pre-load images into Kind
# VPN blocks image pulls inside Kind nodes, so pull on host and load in.
POSTGRES_IMAGE="postgres:15-alpine"

for IMAGE in "$BROKER_IMAGE" "$POSTGRES_IMAGE"; do
  if docker exec "${CLUSTER_NAME}-control-plane" crictl images 2>/dev/null | grep -q "$(echo $IMAGE | cut -d: -f1)"; then
    echo "✓ $IMAGE already loaded in Kind"
  else
    echo "→ Pulling $IMAGE on host..."
    docker pull "$IMAGE"
    echo "→ Loading $IMAGE into Kind..."
    kind load docker-image "$IMAGE" --name "$CLUSTER_NAME"
  fi
done

# 3. Create Secret from .env
echo "→ Creating K8s Secret from .env..."
"$SCRIPT_DIR/create-secret.sh"

# 4. Deploy Postgres
if kubectl get deployment postgres &>/dev/null; then
  echo "✓ Postgres already deployed"
else
  echo "→ Deploying Postgres..."
  kubectl apply -f "$ROOT_DIR/k8s/postgres.yaml"
fi
echo "→ Waiting for Postgres to be ready..."
kubectl rollout status deployment/postgres --timeout=60s

# 5. Deploy Pact Broker
echo "→ Deploying Pact Broker..."
kubectl apply -f "$ROOT_DIR/k8s/pact-broker.yaml"
echo "→ Waiting for Pact Broker to be ready (startup probe allows up to 150s)..."
kubectl rollout status deployment/pact-broker --timeout=180s

# 6. Verify heartbeat
echo "→ Verifying Broker heartbeat..."
RETRIES=5
for i in $(seq 1 $RETRIES); do
  if curl -sf "$BROKER_URL/diagnostic/status/heartbeat" >/dev/null 2>&1; then
    echo "✓ Broker is healthy"
    break
  fi
  if [[ $i -eq $RETRIES ]]; then
    echo "ERROR: Broker heartbeat failed after $RETRIES attempts"
    echo "Check logs: kubectl logs deploy/pact-broker"
    exit 1
  fi
  echo "  Attempt $i/$RETRIES — retrying in 3s..."
  sleep 3
done

# 7. Register 'local' environment
source "$ROOT_DIR/.env"

echo "→ Registering 'local' environment on the Broker..."
if npx pact-broker list-environments \
  --broker-base-url "$BROKER_URL" \
  --broker-username "$PACT_BROKER_AUTH_USERNAME" \
  --broker-password "$PACT_BROKER_AUTH_PASSWORD" 2>/dev/null | grep -q "local"; then
  echo "✓ Environment 'local' already registered"
else
  npx pact-broker create-environment \
    --name local \
    --display-name Local \
    --no-production \
    --broker-base-url "$BROKER_URL" \
    --broker-username "$PACT_BROKER_AUTH_USERNAME" \
    --broker-password "$PACT_BROKER_AUTH_PASSWORD"
  echo "✓ Environment 'local' registered"
fi

echo ""
echo "=== Pact Broker Deploy Complete ==="
echo "  URL:            $BROKER_URL"
echo "  UI:             $BROKER_URL (login with read-only credentials from .env)"
echo "  Heartbeat:      $BROKER_URL/diagnostic/status/heartbeat"
echo ""
echo "Next: Phase 2 — write provider verification tests for Service B"
