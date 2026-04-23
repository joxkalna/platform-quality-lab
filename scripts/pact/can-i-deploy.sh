#!/usr/bin/env bash
set -euo pipefail

# Checks if services are safe to deploy, then records deployment.
# Runs after provider verification.
#
# Usage: ./scripts/pact/can-i-deploy.sh

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

source "$ROOT_DIR/.env"

BROKER_URL="$PACT_BROKER_BASE_URL"
TOKEN="$PACT_BROKER_TOKEN"
COMMIT=$(git rev-parse --short=8 HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Determine environment: main → prod, everything else → dev
ENV="dev"
[[ "$BRANCH" == "main" ]] && ENV="prod"

echo "=== Can-I-Deploy ==="
echo "  Environment: $ENV"
echo "  Version:     $COMMIT"

# --- Multi-repo pattern (production) ---
# Each service has its own pipeline and commit SHA.
# can-i-deploy checks: "is my version compatible with what's currently deployed?"
#
# Consumer pipeline:
#   npx pact-broker can-i-deploy \
#     --pacticipant service-a \
#     --version "$COMMIT" \
#     --to-environment "$ENV" \
#     --broker-base-url "$BROKER_URL" \
#     --broker-token "$TOKEN" \
#     --retry-while-unknown 5 \
#     --retry-interval 10
#
# Provider pipeline:
#   npx pact-broker can-i-deploy \
#     --pacticipant service-b \
#     --version "$COMMIT" \
#     --to-environment "$ENV" \
#     --broker-base-url "$BROKER_URL" \
#     --broker-token "$TOKEN" \
#     --retry-while-unknown 5 \
#     --retry-interval 10

# --- Monorepo workaround ---
# Both services share a commit, so we check them against each other
# at the same version instead of against what's deployed.
# This avoids the version mismatch when the deployed version (from a
# previous pipeline run) differs from the current commit.
echo "→ Checking service-a + service-b + service-c compatibility..."
npx pact-broker can-i-deploy \
  --pacticipant service-a \
  --version "$COMMIT" \
  --pacticipant service-b \
  --version "$COMMIT" \
  --pacticipant service-c \
  --version "$COMMIT" \
  --broker-base-url "$BROKER_URL" \
  --broker-token "$TOKEN"

echo "✓ Safe to deploy"

echo ""
echo "=== Recording Deployments ==="

# Only record deployments on main. Feature branches publish pacts and
# verify them, but they don't represent a real deployment to any
# environment. Recording deployments from branches pollutes the Broker
# — deployedOrReleased selectors would pull branch pacts during
# provider verification, causing failures when the branch is reverted
# or merged without those changes.
#
# Pattern:
#   main   → record-deployment (this version is live in $ENV)
#   branch → skip (pact is published + verified, but not "deployed")

if [[ "$BRANCH" != "main" ]]; then
  echo "→ Skipping record-deployment (branch: $BRANCH, not main)"
  echo "  Pacts are published and verified, but not recorded as deployed."
  echo "  record-deployment only runs after merge to main."
  exit 0
fi

for SERVICE in service-a service-b service-c; do
  echo "→ Recording $SERVICE deployment to $ENV..."
  npx pact-broker record-deployment \
    --pacticipant "$SERVICE" \
    --version "$COMMIT" \
    --environment "$ENV" \
    --broker-base-url "$BROKER_URL" \
    --broker-token "$TOKEN"
  echo "✓ $SERVICE recorded"
done

echo ""
echo "✓ All services deployed to $ENV"
