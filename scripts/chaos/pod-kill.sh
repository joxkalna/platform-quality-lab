#!/usr/bin/env bash
set -euo pipefail

# Pod Kill — Chaos Experiment
# Deletes a random pod from a deployment and verifies:
#   1. Service stays reachable during the kill (surviving replica handles traffic)
#   2. K8s reschedules a replacement pod automatically
#   3. Full replica count is restored

SERVICE="${1:?Usage: pod-kill.sh <service-name> (e.g. service-a)}"
NAMESPACE="${NAMESPACE:-default}"
TIMEOUT="${TIMEOUT:-60}"

# --- Resolve service port from K8s service spec ---
PORT=$(kubectl get svc "$SERVICE" -n "$NAMESPACE" -o jsonpath='{.spec.ports[0].port}')

# --- Get current state ---
DESIRED=$(kubectl get deployment "$SERVICE" -n "$NAMESPACE" -o jsonpath='{.spec.replicas}')
echo "=== Pod Kill: $SERVICE (${DESIRED} replicas) ==="

if [ "$DESIRED" -lt 2 ]; then
  echo "✗ SKIP: Need at least 2 replicas to test resilience (have $DESIRED)"
  exit 1
fi

# --- Pick a random pod ---
TARGET_POD=$(kubectl get pods -l "app=$SERVICE" -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}')
echo "→ Target pod: $TARGET_POD"

# --- Kill it ---
echo "→ Deleting pod..."
kubectl delete pod "$TARGET_POD" -n "$NAMESPACE" --wait=false

# --- Immediately test: is the service still reachable via the surviving replica? ---
echo "→ Testing service availability during pod kill..."
SURVIVING_POD=$(kubectl get pods -l "app=$SERVICE" -n "$NAMESPACE" --field-selector="status.phase=Running" \
  -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)

if [ -z "$SURVIVING_POD" ]; then
  echo "✗ FAIL: No surviving pod found immediately after kill"
  exit 1
fi

if kubectl exec "$SURVIVING_POD" -n "$NAMESPACE" -- wget -qO- --timeout=5 "http://localhost:${PORT}/health" &>/dev/null; then
  echo "✓ Service still reachable via surviving pod: $SURVIVING_POD"
else
  echo "✗ FAIL: Service unreachable after pod kill"
  exit 1
fi

# --- Wait for K8s to restore full replica count ---
echo "→ Waiting for replacement pod (timeout: ${TIMEOUT}s)..."
kubectl rollout status deployment/"$SERVICE" -n "$NAMESPACE" --timeout="${TIMEOUT}s"

READY=$(kubectl get deployment "$SERVICE" -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}')
if [ "$READY" -eq "$DESIRED" ]; then
  echo "✓ Replica count restored: $READY/$DESIRED"
else
  echo "✗ FAIL: Expected $DESIRED ready replicas, got ${READY:-0}"
  exit 1
fi

echo ""
echo "=== Pod Kill: PASSED ==="
echo "Summary:"
echo "  - Killed: $TARGET_POD"
echo "  - Service stayed reachable: yes"
echo "  - Replicas restored: $READY/$DESIRED"
