#!/usr/bin/env bash
set -euo pipefail

# Resource Pressure — Chaos Experiment (Sidecar Approach)
# Injects a stress-ng sidecar into the deployment, runs stress, observes K8s behaviour.
# No service code changes — the sidecar shares the pod's resource cgroup.
#
# CPU: stress-ng burns CPU → pod gets throttled → app responds slower but stays alive
# Memory: stress-ng allocates beyond 128Mi limit → pod OOMKilled → K8s restarts it

source "$(dirname "$0")/lib/report.sh"
show_help "${1:-}" \
  "Usage: resource-pressure.sh <service-name> <cpu|mem|all>" "" \
  "Injects a stress-ng sidecar to test CPU throttling and OOMKill behaviour." \
  "Requires a running Kind cluster with the service deployed."

SERVICE="${1:?Usage: resource-pressure.sh <service-name> <cpu|mem|all>}"
MODE="${2:-all}"
NAMESPACE="${NAMESPACE:-default}"
TIMEOUT="${TIMEOUT:-60}"

PORT=$(kubectl get svc "$SERVICE" -n "$NAMESPACE" -o jsonpath='{.spec.ports[0].port}')

echo "=== Resource Pressure: $SERVICE (mode: $MODE) ==="

report_start "resource-pressure-${MODE}" "$SERVICE"

FAILED=false

# --- Ensure stress-ng image is loaded into Kind ---
ensure_stress_image() {
  if ! docker image inspect alexeiled/stress-ng:latest &>/dev/null; then
    echo "→ Pulling stress-ng image..."
    docker pull alexeiled/stress-ng:latest
  fi
  if ! kubectl get pods -n "$NAMESPACE" -o jsonpath='{.items[*].spec.containers[*].image}' | grep -q stress-ng; then
    echo "→ Loading stress-ng image into Kind..."
    kind load docker-image alexeiled/stress-ng:latest --name "${KIND_CLUSTER:-platform-lab}"
  fi
}

# --- Inject sidecar into deployment ---
inject_sidecar() {
  local stress_args="$1"
  echo "→ Injecting stress-ng sidecar (args: $stress_args)..."
  kubectl patch deployment "$SERVICE" -n "$NAMESPACE" --type='json' -p="[
    {\"op\": \"add\", \"path\": \"/spec/template/spec/containers/-\", \"value\": {
      \"name\": \"stress-ng\",
      \"image\": \"alexeiled/stress-ng:latest\",
      \"imagePullPolicy\": \"Never\",
      \"command\": [\"/stress-ng\"],
      \"args\": $stress_args,
      \"resources\": {}
    }}
  ]"
  echo "→ Waiting for rollout with sidecar..."
  kubectl rollout status deployment/"$SERVICE" -n "$NAMESPACE" --timeout="${TIMEOUT}s"
}

# --- Remove sidecar from deployment ---
remove_sidecar() {
  echo "→ Removing stress-ng sidecar..."
  local idx
  idx=$(kubectl get deployment "$SERVICE" -n "$NAMESPACE" -o json \
    | python3 -c "import sys,json; cs=json.load(sys.stdin)['spec']['template']['spec']['containers']; print(next(i for i,c in enumerate(cs) if c['name']=='stress-ng'))")
  kubectl patch deployment "$SERVICE" -n "$NAMESPACE" --type='json' \
    -p="[{\"op\": \"remove\", \"path\": \"/spec/template/spec/containers/$idx\"}]"
  kubectl rollout status deployment/"$SERVICE" -n "$NAMESPACE" --timeout="${TIMEOUT}s"
}

# --- CPU Stress ---
run_cpu_stress() {
  echo ""
  echo "--- CPU Throttling Test ---"

  inject_sidecar '["-c", "2", "--cpu-method", "matrixprod", "-t", "15s"]'

  POD=$(kubectl get pods -l "app=$SERVICE" -n "$NAMESPACE" --field-selector="status.phase=Running" -o jsonpath='{.items[0].metadata.name}')
  echo "→ Target pod: $POD"
  echo "→ stress-ng burning CPU for 15s (limit is 200m)..."
  sleep 15

  echo "→ Checking app container survived..."
  if kubectl exec "$POD" -c "$SERVICE" -n "$NAMESPACE" -- wget -qO- --timeout=5 "http://localhost:${PORT}/health" &>/dev/null; then
    echo "✓ App still alive — CPU was throttled, not killed"
    check_pass "cpu-app-alive" "App survived CPU stress — throttled, not killed"
  else
    echo "✗ App unreachable after CPU stress"
    check_fail "cpu-app-alive" "App unreachable after CPU stress" \
      "App container stopped responding during CPU pressure" \
      "CPU throttling should slow the app, not kill it — may indicate a crash from timeout cascade" \
      "services/${SERVICE}/src/index.ts" \
      "Check for CPU-sensitive operations that could cascade into failures"
    FAILED=true
  fi

  RESTARTS=$(kubectl get pod "$POD" -n "$NAMESPACE" -o jsonpath="{.status.containerStatuses[?(@.name==\"$SERVICE\")].restartCount}")
  echo "→ App container restarts: $RESTARTS (expected: 0)"
  if [ "$RESTARTS" -eq 0 ]; then
    check_pass "cpu-zero-restarts" "Zero restarts during CPU stress"
  else
    check_fail "cpu-zero-restarts" "App restarted $RESTARTS time(s) during CPU stress" \
      "App container restarted under CPU pressure" \
      "Liveness probe may have timed out due to CPU throttling" \
      "k8s/${SERVICE}.yaml" \
      "Increase liveness probe timeoutSeconds or CPU limit"
    FAILED=true
  fi

  remove_sidecar
  echo "✓ CPU throttling test complete"
}

# --- Memory Stress ---
run_mem_stress() {
  echo ""
  echo "--- OOMKill Test ---"

  # Allocate 256MB — well over the 128Mi pod limit
  inject_sidecar '["-m", "1", "--vm-bytes", "256M", "--vm-keep", "-t", "30s"]'

  POD=$(kubectl get pods -l "app=$SERVICE" -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}')
  echo "→ Target pod: $POD"
  echo "→ stress-ng allocating 256MB (pod limit is 128Mi)..."

  echo "→ Waiting for OOMKill..."
  OOM_DETECTED=false
  for i in $(seq 1 "$TIMEOUT"); do
    REASON=$(kubectl get pod "$POD" -n "$NAMESPACE" -o jsonpath='{.status.containerStatuses[?(@.name=="stress-ng")].lastState.terminated.reason}' 2>/dev/null || true)
    if [ "$REASON" = "OOMKilled" ]; then
      echo "✓ stress-ng sidecar was OOMKilled (expected — exceeded memory limit)"
      OOM_DETECTED=true
      break
    fi
    # Also check if the whole pod restarted
    PHASE=$(kubectl get pod "$POD" -n "$NAMESPACE" -o jsonpath='{.status.phase}' 2>/dev/null || true)
    if [ "$PHASE" != "Running" ]; then
      echo "✓ Pod evicted/restarted due to memory pressure"
      OOM_DETECTED=true
      break
    fi
    sleep 1
  done

  if [ "$OOM_DETECTED" = true ]; then
    check_pass "mem-oomkill-detected" "OOMKill detected — memory limits enforced correctly"
  else
    echo "⚠ OOMKill not detected within ${TIMEOUT}s — checking pod state..."
    kubectl get pod "$POD" -n "$NAMESPACE" -o wide
    check_fail "mem-oomkill-detected" "OOMKill not detected within ${TIMEOUT}s" \
      "stress-ng allocated 256MB but pod was not OOMKilled" \
      "Memory limits may not be set or may be too generous" \
      "k8s/${SERVICE}.yaml" \
      "Verify resources.limits.memory is set and appropriate"
    FAILED=true
  fi

  echo "→ Waiting for deployment to stabilise..."
  kubectl rollout status deployment/"$SERVICE" -n "$NAMESPACE" --timeout="${TIMEOUT}s"
  check_pass "mem-recovery" "Deployment stabilised after OOMKill"

  remove_sidecar
  echo "✓ OOMKill test complete"
}

# --- Run ---
ensure_stress_image

case "$MODE" in
  cpu) run_cpu_stress ;;
  mem) run_mem_stress ;;
  all) run_cpu_stress; run_mem_stress ;;
  *) echo "Unknown mode: $MODE (use cpu, mem, or all)"; exit 1 ;;
esac

report_end

echo ""
if [ "$FAILED" = true ]; then
  echo "=== Resource Pressure: FAILED ==="
  exit 1
else
  echo "=== Resource Pressure: PASSED ==="
fi
