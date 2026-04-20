#!/usr/bin/env bash
set -euo pipefail

# Dependency Failure — Chaos Experiment
# Kills a downstream service and observes upstream behaviour.

source "$(dirname "$0")/lib/report.sh"
show_help "${1:-}" \
  "Usage: dependency-failure.sh [upstream] [downstream]" "" \
  "Kills the downstream service and observes upstream behaviour." \
  "Defaults: upstream=service-a, downstream=service-b." \
  "Requires a running Kind cluster with both services deployed."

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

report_start "dependency-failure" "$UPSTREAM"

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
  check_pass "health-liveness" "/health returns ok (no downstream dependency)"
else
  echo "  ✗ FAIL — /health broken"
  check_fail "health-liveness" "/health broken when downstream is down" \
    "Liveness endpoint failed when $DOWNSTREAM was killed" \
    "Liveness should not depend on downstream services" \
    "services/${UPSTREAM}/src/index.ts" \
    "Ensure /health has no downstream dependency checks"
  FAILED=true
fi

# 2b. Data endpoint — should return 502, not hang
echo "→ [2b] /data (should fail gracefully)..."
DATA_RESPONSE=$(kubectl exec "$UPSTREAM_POD" -n "$NAMESPACE" -- wget -qO- --timeout=10 "http://localhost:${UPSTREAM_PORT}/data" 2>&1) || true
if echo "$DATA_RESPONSE" | grep -qi "error\|fail\|502"; then
  echo "  ✓ PASS — /data returned error (graceful degradation)"
  check_pass "graceful-degradation" "/data returned error (graceful degradation, not hang)"
else
  echo "  ✗ FAIL — /data response unexpected: $DATA_RESPONSE"
  check_fail "graceful-degradation" "/data did not return a clear error" \
    "Service hung or returned unexpected response when downstream was unreachable" \
    "Missing timeout on outbound fetch call — request hangs instead of failing" \
    "services/${UPSTREAM}/src/index.ts" \
    "Add AbortSignal.timeout() to all outbound fetch calls"
  FAILED=true
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
if [ "$READY_GONE" = true ]; then
  check_pass "readiness-removed" "$UPSTREAM removed from load balancer when downstream died"
else
  echo "  ✗ FAIL — $UPSTREAM still has endpoints: $READY_ENDPOINTS"
  check_fail "readiness-removed" "$UPSTREAM still in load balancer with dead downstream" \
    "Readiness probe did not fail when $DOWNSTREAM was unreachable" \
    "Readiness probe may not check downstream health, or uses same path as liveness" \
    "k8s/${UPSTREAM}.yaml" \
    "Ensure readinessProbe checks downstream dependency (separate from livenessProbe)"
  FAILED=true
fi

# 2d. Pod didn't crash
RESTARTS=$(kubectl get pod "$UPSTREAM_POD" -n "$NAMESPACE" -o jsonpath="{.status.containerStatuses[0].restartCount}")
echo "→ [2d] Restarts: $RESTARTS"
if [ "$RESTARTS" -eq 0 ]; then
  echo "  ✓ PASS — zero restarts"
  check_pass "zero-restarts" "Pod did not crash (zero restarts)"
else
  echo "  ✗ FAIL — pod restarted"
  check_fail "zero-restarts" "Pod restarted $RESTARTS time(s)" \
    "$UPSTREAM pod crashed when downstream was unavailable" \
    "Unhandled error in downstream call may be crashing the process" \
    "services/${UPSTREAM}/src/index.ts" \
    "Wrap downstream calls in try/catch — return error response, don't crash"
  FAILED=true
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
if [ "$RECOVERED" = true ]; then
  check_pass "recovery-readiness" "$UPSTREAM readiness recovered after $DOWNSTREAM restored"
else
  echo "✗ $UPSTREAM did not recover readiness"
  check_fail "recovery-readiness" "$UPSTREAM did not recover readiness" \
    "$UPSTREAM still not ready after $DOWNSTREAM was restored" \
    "Readiness probe may be cached or downstream recovery not detected" \
    "k8s/${UPSTREAM}.yaml" \
    "Check readiness probe periodSeconds and timeout values"
  FAILED=true
fi

# Verify /data works again (re-resolve pod name — original may have been replaced)
UPSTREAM_POD=$(kubectl get pods -l "app=$UPSTREAM" -n "$NAMESPACE" --field-selector="status.phase=Running" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
RECOVERY_RESPONSE=$(kubectl exec "$UPSTREAM_POD" -n "$NAMESPACE" -- wget -qO- --timeout=10 "http://localhost:${UPSTREAM_PORT}/data" 2>&1) || true
if echo "$RECOVERY_RESPONSE" | grep -q "service-b"; then
  echo "✓ /data recovered — downstream data flowing"
  check_pass "recovery-data" "/data recovered — downstream data flowing"
else
  echo "✗ /data did not recover: $RECOVERY_RESPONSE"
  check_fail "recovery-data" "/data did not recover after $DOWNSTREAM restored" \
    "Data endpoint still failing after downstream recovery" \
    "Connection pool or DNS cache may be stale" \
    "services/${UPSTREAM}/src/index.ts" \
    "Ensure fetch creates new connections (no persistent connection pool holding dead refs)"
  FAILED=true
fi

report_end

# === Result ===
echo ""
if [ "$FAILED" = true ]; then
  echo "=== Dependency Failure: FAILED ==="
  exit 1
else
  echo "=== Dependency Failure: PASSED ==="
fi
