#!/usr/bin/env bash

NAMESPACE="${NAMESPACE:-default}"
TIMEOUT="${TIMEOUT:-60s}"
CLUSTER_NAME="${CLUSTER_NAME:-platform-lab}"

# Run once before all tests — fail fast if no cluster
setup() {
  if ! kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
    echo "ERROR: Kind cluster '${CLUSTER_NAME}' not found. Run ./scripts/deploy-local.sh first." >&2
    return 1
  fi

  if ! kubectl cluster-info &>/dev/null; then
    echo "ERROR: Cannot connect to cluster. Check kubectl context." >&2
    return 1
  fi
}

wait_for_rollout() {
  local deployment="$1"
  kubectl rollout status "deployment/$deployment" -n "$NAMESPACE" --timeout="$TIMEOUT"
}

get_ready_replicas() {
  local deployment="$1"
  kubectl get deployment "$deployment" -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}'
}

get_desired_replicas() {
  local deployment="$1"
  kubectl get deployment "$deployment" -n "$NAMESPACE" -o jsonpath='{.spec.replicas}'
}

exec_in_pod() {
  local deployment="$1"
  shift
  kubectl exec "deploy/$deployment" -n "$NAMESPACE" -- "$@"
}
