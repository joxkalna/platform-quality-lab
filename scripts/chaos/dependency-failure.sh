#!/usr/bin/env bash
set -euo pipefail

# Dependency Failure — Chaos Experiment
# Kills a downstream service and observes upstream behaviour.

UPSTREAM="${1:-service-a}"
DOWNSTREAM="${2:-service-b}"
NAMESPACE="${NAMESPACE:-default}"
TIMEOUT="${TIMEOUT:-60}"

UPSTREAM_PORT=$(kubectl get svc "$UPSTREAM" -n "$NAMESPACE" -o jsonpath='{.spec.ports[0].port}')
UPSTREAM_POD=$(kubectl get pods -l "app=$UPSTREAM" -n "$NAMESPACE" --field-selector="status.phase=Running" -o jsonpath='{.items[0].metadata.name}')
ORIGINAL_REPLICAS=$(kubectl get deployment "$DOWNSTREAM" -n "$NAMESPACE" -o jsonpath='{.spec.replicas}')
FAILED=false

echo "=== Dependency Failure: kill $DOWNSTREAM, observe $UPSTREAM ==="
echo "→ Upstream pod: $UPSTREAM_POD"
echo "→ Downstream replicas: $ORIGINAL_REPLICAS"

# === Phase 1: Kill downstream ===
echo ""
echo "--- Phase 1: Kill $DOWNSTREAM ---"
kubectl scale deployment "$DOWNSTREAM" -n "$NAMESPACE" --replicas=0
kubectl wait --for=delete pods -l "app=$DOWNSTREAM" -n "$NAMESPACE" --timeout="${TIMEOUT}s" 2>/dev/null || true
echo "✓ $DOWNSTREAM pods terminated"

# === Phase 2: Observe upstream ===
echo ""
echo "--- Phase 2: Observe $UPSTREAM ---"

# 2a. Health (liveness) — should pass, no downstream dependency
echo "→ [2a] /health (liveness)..."
if kubectl exec "$UPSTREAM_POD" -n "$NAMESPACE" -- wget -qO- --timeout=5 "http://localhost:${UPSTREAM_PORT}/health" 2>&1 | grep -q "ok"; then
  echo "  ✓ PASS — /health returns ok"
else
  echo "  ✗ FAIL — /health broken"; FAILED=true
fi

# 2b. Data endpoint — should return 502, not hang
echo "→ [2b] /data (should fail gracefully)..."
DATA_RESPONSE=$(kubectl exec "$UPSTREAM_POD" -n "$NAMESPACE" -- wget -qO- --timeout=10 "http://localhost:${UPSTREAM_PORT}/data" 2>&1) || true
if echo "$DATA_RESPONSE" | grep -qi "error\|fail\|502"; then
  echo "  ✓ PASS — /data returned error (graceful degradation)"
else
  echo "  ✗ FAIL — /data response unexpected: $DATA_RESPONSE"; FAILED=true
fi

# 2c. Readiness — upstream should be pulled from load balancer
echo "→ [2c] Readiness (waiting for probe to fail)..."
READY_GONE=false
for i in $(seq 1 30); do
  READY_ENDPOINTS=$(kubectl get endpoints "$UPSTREAM" -n "$NAMESPACE" -o jsonpath='{.subsets[*].addresses[*].ip}' 2>/dev/null || true)
  if [ -z "$READY_ENDPOINTS" ]; then
    echo "  ✓ PASS — $UPSTREAM removed from load balancer (0 ready endpoints)"
    READY_GONE=true
    break
  fi
  sleep 1
done
if [ "$READY_GONE" = false ]; then
  echo "  ✗ FAIL — $UPSTREAM still has endpoints: $READY_ENDPOINTS"; FAILED=true
fi

# 2d. Pod didn't crash
RESTARTS=$(kubectl get pod "$UPSTREAM_POD" -n "$NAMESPACE" -o jsonpath="{.status.containerStatuses[0].restartCount}")
echo "→ [2d] Restarts: $RESTARTS"
if [ "$RESTARTS" -eq 0 ]; then
  echo "  ✓ PASS — zero restarts"
else
  echo "  ✗ FAIL — pod restarted"; FAILED=true
fi

# === Phase 3: Recovery ===
echo ""
echo "--- Phase 3: Restore $DOWNSTREAM ---"
kubectl scale deployment "$DOWNSTREAM" -n "$NAMESPACE" --replicas="$ORIGINAL_REPLICAS"
kubectl rollout status deployment/"$DOWNSTREAM" -n "$NAMESPACE" --timeout="${TIMEOUT}s"

# Wait for upstream readiness to recover
RECOVERED=false
for i in $(seq 1 "$TIMEOUT"); do
  READY_ENDPOINTS=$(kubectl get endpoints "$UPSTREAM" -n "$NAMESPACE" -o jsonpath='{.subsets[*].addresses[*].ip}' 2>/dev/null || true)
  if [ -n "$READY_ENDPOINTS" ]; then
    echo "✓ $UPSTREAM back in load balancer"
    RECOVERED=true
    break
  fi
  sleep 1
done
if [ "$RECOVERED" = false ]; then
  echo "✗ $UPSTREAM did not recover readiness"; FAILED=true
fi

# Verify /data works again
RECOVERY_RESPONSE=$(kubectl exec "$UPSTREAM_POD" -n "$NAMESPACE" -- wget -qO- --timeout=10 "http://localhost:${UPSTREAM_PORT}/data" 2>&1) || true
if echo "$RECOVERY_RESPONSE" | grep -q "service-b"; then
  echo "✓ /data recovered — downstream data flowing"
else
  echo "✗ /data did not recover: $RECOVERY_RESPONSE"; FAILED=true
fi

# === Result ===
echo ""
if [ "$FAILED" = true ]; then
  echo "=== Dependency Failure: FAILED ==="
  exit 1
else
  echo "=== Dependency Failure: PASSED ==="
fi
