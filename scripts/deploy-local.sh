#!/usr/bin/env bash
set -euo pipefail

# === Learning Note: How this maps to production (e.g. GCP/GKE) ===
# This script       → Real world
# kind create       → Terraform managing GKE cluster
# docker build      → CI pipeline (GitHub Actions / Cloud Build)
# kind load         → Push to container registry (Artifact Registry)
# kubectl apply     → GitOps operator (ArgoCD / Flux) syncing from Git
# rollout status    → ArgoCD health checks + monitoring (Datadog/Prometheus)
# kubectl exec test → Integration tests in CI + synthetic monitoring
# =================================================================

CLUSTER_NAME="platform-lab"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Phase 2: Local Kind Deploy ==="

# 1. Create cluster (skip if exists)
if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
  echo "✓ Cluster '${CLUSTER_NAME}' already exists, skipping creation"
else
  echo "→ Creating Kind cluster..."
  kind create cluster --name "$CLUSTER_NAME" --config "$ROOT_DIR/kind-config.yaml"
fi

# 2. Install metrics-server (skip if exists)
if kubectl get deployment metrics-server -n kube-system &>/dev/null; then
  echo "✓ metrics-server already installed"
else
  echo "→ Installing metrics-server..."
  docker pull registry.k8s.io/metrics-server/metrics-server:v0.7.2
  kind load docker-image registry.k8s.io/metrics-server/metrics-server:v0.7.2 --name "$CLUSTER_NAME"
  kubectl apply -f "$ROOT_DIR/k8s/vendor/metrics-server.yaml"
fi

# 3. Build images
echo "→ Building Docker images..."
docker build -t service-a:latest "$ROOT_DIR/services/service-a"
docker build -t service-b:latest "$ROOT_DIR/services/service-b"
docker build -t service-c:latest "$ROOT_DIR/services/service-c"

# 4. Load into Kind
echo "→ Loading images into Kind..."
kind load docker-image service-a:latest --name "$CLUSTER_NAME"
kind load docker-image service-b:latest --name "$CLUSTER_NAME"
kind load docker-image service-c:latest --name "$CLUSTER_NAME"

# 5. Deploy (B and C first — A depends on both)
echo "→ Deploying services..."
kubectl apply -f "$ROOT_DIR/k8s/service-b.yaml"
kubectl apply -f "$ROOT_DIR/k8s/service-c.yaml"
kubectl apply -f "$ROOT_DIR/k8s/service-a.yaml"

# 6. Wait for rollout
echo "→ Waiting for pods to be ready..."
kubectl rollout status deployment/service-b --timeout=60s
kubectl rollout status deployment/service-c --timeout=60s
kubectl rollout status deployment/service-a --timeout=60s

# 7. Verify
echo "→ Verifying service-to-service communication..."
kubectl exec deploy/service-a -- wget -qO- http://service-b:3001/info
echo ""
kubectl exec deploy/service-a -- wget -qO- http://localhost:3000/data
echo ""

echo ""
echo "=== Deploy complete ==="
kubectl get pods -o wide
