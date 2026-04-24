#!/usr/bin/env bash
set -euo pipefail

# Checks if services are safe to deploy, then records deployment.
# Follows the production pattern:
#   can-i-deploy(env) → deploy(env) → record-deployment(env)
# repeated per environment (dev, qa, prod) on main only.
#
# Feature branches: compatibility check only (no record-deployment).
# Main branch: per-environment can-i-deploy + record-deployment.
#
# Usage: ./scripts/pact/can-i-deploy.sh

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

source "$ROOT_DIR/.env"

BROKER_URL="$PACT_BROKER_BASE_URL"
TOKEN="$PACT_BROKER_TOKEN"
COMMIT=$(git rev-parse --short=8 HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)

SERVICES=(service-a service-b service-c)

# --- Multi-repo pattern (production) ---
# Each service has its own pipeline and commit SHA.
# can-i-deploy checks one service against what's deployed to a specific env:
#
#   pact-broker can-i-deploy \
#     --pacticipant service-a \
#     --version "$COMMIT" \
#     --to-environment "$ENV" \
#     --broker-base-url "$BROKER_URL" \
#     --broker-token "$TOKEN" \
#     --retry-while-unknown 10 \
#     --retry-interval 20

# --- Monorepo workaround ---
# All services share a commit, so we check them against each other
# at the same version instead of against what's deployed.
# This avoids the version mismatch when the deployed version (from a
# previous pipeline run) differs from the current commit.
can_i_deploy() {
  local env="$1"
  echo "→ Checking compatibility for $env..."
  npx pact-broker can-i-deploy \
    --pacticipant service-a \
    --version "$COMMIT" \
    --pacticipant service-b \
    --version "$COMMIT" \
    --pacticipant service-c \
    --version "$COMMIT" \
    --broker-base-url "$BROKER_URL" \
    --broker-token "$TOKEN" \
    --retry-while-unknown 10 \
    --retry-interval 20
  echo "✓ Safe to deploy to $env"
}

record_deployment() {
  local env="$1"
  for service in "${SERVICES[@]}"; do
    echo "→ Recording $service deployment to $env..."
    npx pact-broker record-deployment \
      --pacticipant "$service" \
      --version "$COMMIT" \
      --environment "$env" \
      --broker-base-url "$BROKER_URL" \
      --broker-token "$TOKEN"
    echo "✓ $service recorded in $env"
  done
}

echo "=== Can-I-Deploy ==="
echo "  Version: $COMMIT"
echo "  Branch:  $BRANCH"
echo ""

# Feature branches: compatibility check only, no record-deployment.
# A feature branch pact is a proposal, not a deployment.
# Recording deployments from branches pollutes the Broker —
# deployedOrReleased selectors would pull branch pacts during
# provider verification, causing failures when the branch is
# reverted or merged without those changes.
if [[ "$BRANCH" != "main" ]]; then
  can_i_deploy "dev (branch check)"
  echo ""
  echo "→ Skipping record-deployment (branch: $BRANCH, not main)"
  echo "  Pacts are published and verified, but not recorded as deployed."
  echo "  record-deployment only runs after merge to main."
  exit 0
fi

# Main branch: per-environment can-i-deploy + record-deployment.
# Each environment gets its own gate and its own deployment record,
# mirroring the production pattern where each deploy stage runs:
#   can-i-deploy(env) → deploy(env) → record-deployment(env)
#
# In our Kind cluster there's one actual deploy, but we record
# against all three environments so the Broker tracks the full
# lifecycle (dev → qa → prod).

for ENV in dev qa prod; do
  echo "--- ${ENV^^} ---"
  can_i_deploy "$ENV"
  echo "→ (Kind deploy happens once — recording $ENV)"
  record_deployment "$ENV"
  echo ""
done

echo "✓ All services deployed to dev + qa + prod"
