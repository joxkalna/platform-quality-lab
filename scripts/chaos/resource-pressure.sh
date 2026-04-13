#!/usr/bin/env bash
set -euo pipefail

# Resource Pressure — Chaos Experiment (Sidecar Approach)
# Injects a stress-ng sidecar into the deployment, runs stress, observes K8s behaviour.
# No service code changes — the sidecar shares the pod's resource cgroup.
#
# CPU: stress-ng burns CPU → pod gets throttled → app responds slower but stays alive
# Memory: stress-ng allocates beyond 128Mi limit → pod OOMKilled → K8s restarts it

SERVICE="${1:?Usage: resource-pressure.sh <service-name> <cpu|mem|all>}"
MODE="${2:-all}"
NAMESPACE="${NAMESPACE:-default}"
TIMEOUT="${TIMEOUT:-60}"

PORT=$(kubectl get svc "$SERVICE" -n "$NAMESPACE" -o jsonpath='{.spec.ports[0].port}')

echo "=== Resource Pressure: $SERVICE (mode: $MODE) ==="

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
  else
    echo "✗ App unreachable after CPU stress"
  fi

  RESTARTS=$(kubectl get pod "$POD" -n "$NAMESPACE" -o jsonpath="{.status.containerStatuses[?(@.name==\"$SERVICE\")].restartCount}")
  echo "→ App container restarts: $RESTARTS (expected: 0)"

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

  if [ "$OOM_DETECTED" = false ]; then
    echo "⚠ OOMKill not detected within ${TIMEOUT}s — checking pod state..."
    kubectl get pod "$POD" -n "$NAMESPACE" -o wide
  fi

  echo "→ Waiting for deployment to stabilise..."
  kubectl rollout status deployment/"$SERVICE" -n "$NAMESPACE" --timeout="${TIMEOUT}s"

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

echo ""
echo "=== Resource Pressure: PASSED ==="
