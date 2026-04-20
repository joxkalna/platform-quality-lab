#!/usr/bin/env bash
set -euo pipefail

# Latency Injection — Chaos Experiment
# Deploys a standalone slow server, points Service A at it, tests timeout behaviour.
# Two scenarios:
#   1. 2s delay (under 3s timeout) → should get data
#   2. 5s delay (over 3s timeout) → should get 502

source "$(dirname "$0")/lib/report.sh"

NAMESPACE="${NAMESPACE:-default}"
TIMEOUT="${TIMEOUT:-60}"
FAILED=false

echo "=== Latency Injection ==="

report_start "latency-injection" "service-a"

# --- Deploy slow server (standalone, not pretending to be service-b) ---
deploy_slow_server() {
  local delay_ms="$1"
  kubectl delete pod slow-server -n "$NAMESPACE" --ignore-not-found --wait=true 2>/dev/null || true

  kubectl apply -n "$NAMESPACE" -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: slow-server
  labels:
    app: slow-server
spec:
  containers:
    - name: server
      image: node:24-alpine
      imagePullPolicy: Never
      command: ["node", "-e"]
      args:
        - |
          const http = require('http');
          http.createServer((req, res) => {
            if (req.url === '/health') {
              res.writeHead(200, {'Content-Type': 'application/json'});
              res.end(JSON.stringify({status:'ok',service:'service-b'}));
              return;
            }
            setTimeout(() => {
              res.writeHead(200, {'Content-Type': 'application/json'});
              res.end(JSON.stringify({service:'service-b',timestamp:Date.now(),data:{version:'1.0.0'}}));
            }, ${delay_ms});
          }).listen(3001);
      ports:
        - containerPort: 3001
---
apiVersion: v1
kind: Service
metadata:
  name: slow-server
spec:
  selector:
    app: slow-server
  ports:
    - port: 3001
      targetPort: 3001
EOF
  kubectl wait --for=condition=Ready pod/slow-server -n "$NAMESPACE" --timeout="${TIMEOUT}s"
}

# --- Point Service A at slow server ---
echo "→ Saving original SERVICE_B_URL..."
ORIGINAL_URL=$(kubectl get deployment service-a -n "$NAMESPACE" -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="SERVICE_B_URL")].value}')

point_to_slow_server() {
  kubectl set env deployment/service-a -n "$NAMESPACE" SERVICE_B_URL="http://slow-server:3001"
  kubectl rollout status deployment/service-a -n "$NAMESPACE" --timeout="${TIMEOUT}s"
}

restore_service_a() {
  kubectl set env deployment/service-a -n "$NAMESPACE" SERVICE_B_URL="$ORIGINAL_URL"
  kubectl rollout status deployment/service-a -n "$NAMESPACE" --timeout="${TIMEOUT}s"
  kubectl delete pod slow-server -n "$NAMESPACE" --ignore-not-found --wait=false
  kubectl delete svc slow-server -n "$NAMESPACE" --ignore-not-found
}

# === Scenario 1: 2s delay (under 3s timeout) — should get data ===
echo ""
echo "--- Scenario 1: 2s delay (under 3s timeout) ---"
deploy_slow_server 2000
point_to_slow_server

UPSTREAM_POD=$(kubectl get pods -l app=service-a -n "$NAMESPACE" --field-selector="status.phase=Running" -o jsonpath='{.items[0].metadata.name}')
echo "→ Hitting /data..."
DATA_RESPONSE=$(kubectl exec "$UPSTREAM_POD" -n "$NAMESPACE" -- wget -qO- --timeout=10 "http://localhost:3000/data" 2>&1) || true

if echo "$DATA_RESPONSE" | grep -q "service-b"; then
  echo "  ✓ PASS — got data back (slow but within timeout)"
  check_pass "under-timeout" "2s delay: got data back (within 3s timeout)"
else
  echo "  ✗ FAIL — expected data, got: $DATA_RESPONSE"
  check_fail "under-timeout" "2s delay: did not get data back" \
    "Service A failed to get response from 2s-delayed downstream" \
    "Timeout may be set too low or fetch is not waiting for slow responses" \
    "services/service-a/src/index.ts" \
    "Check AbortSignal.timeout value — should be > 2s for this to pass"
  FAILED=true
fi

# === Scenario 2: 5s delay (over 3s timeout) — should get 502 ===
echo ""
echo "--- Scenario 2: 5s delay (over 3s timeout) ---"
deploy_slow_server 5000

UPSTREAM_POD=$(kubectl get pods -l app=service-a -n "$NAMESPACE" --field-selector="status.phase=Running" -o jsonpath='{.items[0].metadata.name}')
echo "→ Hitting /data..."
DATA_RESPONSE=$(kubectl exec "$UPSTREAM_POD" -n "$NAMESPACE" -- wget -qO- --timeout=10 "http://localhost:3000/data" 2>&1) || true

if echo "$DATA_RESPONSE" | grep -qi "error\|fail\|502\|timed out"; then
  echo "  ✓ PASS — upstream timed out correctly"
  check_pass "over-timeout" "5s delay: upstream timed out correctly (3s timeout fired)"
else
  echo "  ✗ FAIL — expected timeout, got: $DATA_RESPONSE"
  check_fail "over-timeout" "5s delay: upstream did not time out" \
    "Service A waited for 5s response instead of timing out at 3s" \
    "No timeout configured on outbound fetch call" \
    "services/service-a/src/index.ts" \
    "Add AbortSignal.timeout(3000) to fetch calls"
  FAILED=true
fi

# === Cleanup ===
echo ""
echo "→ Restoring service-a..."
restore_service_a
echo "✓ Restored"

report_end

# === Result ===
echo ""
if [ "$FAILED" = true ]; then
  echo "=== Latency Injection: FAILED ==="
  exit 1
else
  echo "=== Latency Injection: PASSED ==="
fi
