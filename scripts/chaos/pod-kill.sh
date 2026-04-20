#!/usr/bin/env bash
set -euo pipefail

# Pod Kill — Chaos Experiment
# Deletes a random pod from a deployment and verifies:
#   1. Service stays reachable during the kill (surviving replica handles traffic)
#   2. K8s reschedules a replacement pod automatically
#   3. Full replica count is restored

source "$(dirname "$0")/lib/report.sh"

SERVICE="${1:?Usage: pod-kill.sh <service-name> (e.g. service-a)}"
NAMESPACE="${NAMESPACE:-default}"
TIMEOUT="${TIMEOUT:-60}"
FAILED=false

# --- Resolve service port from K8s service spec ---
PORT=$(kubectl get svc "$SERVICE" -n "$NAMESPACE" -o jsonpath='{.spec.ports[0].port}')

# --- Get current state ---
DESIRED=$(kubectl get deployment "$SERVICE" -n "$NAMESPACE" -o jsonpath='{.spec.replicas}')
echo "=== Pod Kill: $SERVICE (${DESIRED} replicas) ==="

report_start "pod-kill" "$SERVICE"

if [ "$DESIRED" -lt 2 ]; then
  echo "✗ SKIP: Need at least 2 replicas to test resilience (have $DESIRED)"
  check_fail "minimum-replicas" "Need at least 2 replicas (have $DESIRED)" \
    "Cannot test pod kill resilience with $DESIRED replica(s)" \
    "Single replica means any pod death is a full outage" \
    "k8s/${SERVICE}.yaml" \
    "Set spec.replicas >= 2"
  report_end
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
  check_fail "service-reachable" "No surviving pod found after kill" \
    "All pods gone immediately after deleting one" \
    "Replicas may have been terminating or not fully ready" \
    "k8s/${SERVICE}.yaml" \
    "Ensure replicas >= 2 and pods are fully ready before experiment"
  FAILED=true
elif kubectl exec "$SURVIVING_POD" -n "$NAMESPACE" -- wget -qO- --timeout=5 "http://localhost:${PORT}/health" &>/dev/null; then
  echo "✓ Service still reachable via surviving pod: $SURVIVING_POD"
  check_pass "service-reachable" "Service stayed reachable via surviving pod: $SURVIVING_POD"
else
  echo "✗ FAIL: Service unreachable after pod kill"
  check_fail "service-reachable" "Surviving pod $SURVIVING_POD not responding to /health" \
    "Pod exists but health endpoint unreachable" \
    "Pod may not be ready or app may have crashed" \
    "services/${SERVICE}/src/index.ts" \
    "Check readiness probe and app startup"
  FAILED=true
fi

# --- Wait for K8s to restore full replica count ---
echo "→ Waiting for replacement pod (timeout: ${TIMEOUT}s)..."
if kubectl rollout status deployment/"$SERVICE" -n "$NAMESPACE" --timeout="${TIMEOUT}s"; then
  READY=$(kubectl get deployment "$SERVICE" -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}')
  if [ "$READY" -eq "$DESIRED" ]; then
    echo "✓ Replica count restored: $READY/$DESIRED"
    check_pass "replicas-restored" "Replica count restored: $READY/$DESIRED"
  else
    echo "✗ FAIL: Expected $DESIRED ready replicas, got ${READY:-0}"
    check_fail "replicas-restored" "Expected $DESIRED replicas, got ${READY:-0}" \
      "K8s did not restore full replica count within ${TIMEOUT}s" \
      "Scheduler may be under pressure or node resources exhausted" \
      "k8s/${SERVICE}.yaml" \
      "Check node capacity and resource quotas"
    FAILED=true
  fi
else
  echo "✗ FAIL: Rollout did not complete within ${TIMEOUT}s"
  check_fail "replicas-restored" "Rollout timed out after ${TIMEOUT}s" \
    "Replacement pod not scheduled or not passing readiness" \
    "Image pull failure, resource pressure, or readiness probe misconfiguration" \
    "k8s/${SERVICE}.yaml" \
    "Check pod events: kubectl describe pod -l app=${SERVICE}"
  FAILED=true
fi

report_end

echo ""
if [ "$FAILED" = true ]; then
  echo "=== Pod Kill: FAILED ==="
  exit 1
else
  echo "=== Pod Kill: PASSED ==="
  echo "Summary:"
  echo "  - Killed: $TARGET_POD"
  echo "  - Service stayed reachable: yes"
  echo "  - Replicas restored: $READY/$DESIRED"
fi
