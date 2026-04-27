#!/usr/bin/env bash
set -euo pipefail

# Pact deployment gate — checks compatibility and records deployments.
#
# 4 functions following the standard Pact CI/CD pattern:
#   pact_can_i_deploy            — core: checks a pacticipant against an environment
#   pact_can_i_deploy_to_env     — wrapper: adds main-only guard, used in deploy stages
#   pact_can_deploy_to_upper_env — feature branches: early feedback, no main guard
#   pact_record_deployment       — records deployment to Broker, main-only guard
#
# Flow:
#   Feature branches: pact_can_deploy_to_upper_env (early feedback against all envs)
#   Main branch:      pact_can_i_deploy_to_env → deploy → pact_record_deployment (per env)
#
# In a multi-repo setup, each deploy stage sets ENVIRONMENT and PACTICIPANTS
# for that specific service and environment. In our monorepo, we loop all
# services and all environments in one script — but the functions are identical.
#
# Usage: ./scripts/pact/can-i-deploy.sh

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

source "$ROOT_DIR/.env"

BROKER_URL="$PACT_BROKER_BASE_URL"
TOKEN="$PACT_BROKER_TOKEN"
COMMIT=$(git rev-parse --short=8 HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Semicolon-separated list of pacticipants. In a multi-repo setup, this is
# set per deploy job (e.g. "my-consumer;my-provider" for a stack that has both).
PACTICIPANTS="service-a;service-b;service-c"

# In a multi-repo setup, ENVIRONMENT is set per deploy job.
# We loop all environments below since we have one Kind cluster.
ENVIRONMENTS=(dev qa prod)

# Maps CI environment names to Broker environment names.
# Useful when CI uses account-specific names (e.g. "aws-qa-account")
# but the Broker uses generic names (e.g. "qa").
# Our environments are already generic, so this is a passthrough.
pact_map_environment() {
  local env="$1"
  echo "$env"
}

# Core function. Checks each pacticipant against a target environment using
# --to-environment. Used by both feature branches (early feedback) and main
# (deploy gate). Skips silently if pacticipants or environment are missing.
pact_can_i_deploy() {
  local environment="$1"
  local pacticipants="$2"

  if [[ -z "$pacticipants" ]]; then
    echo "→ Skipping can-i-deploy (no pacticipants defined)"
    return 0
  fi

  if [[ -z "$environment" ]]; then
    echo "→ Skipping can-i-deploy (no environment defined)"
    return 0
  fi

  local broker_env
  broker_env=$(pact_map_environment "$environment")

  local IFS=";"
  for pacticipant in $pacticipants; do
    echo "→ Checking if $pacticipant can deploy to $broker_env..."
    npx pact-broker can-i-deploy \
      --pacticipant "$pacticipant" \
      --version "$COMMIT" \
      --to-environment "$broker_env" \
      --broker-base-url "$BROKER_URL" \
      --broker-token "$TOKEN" \
      --retry-while-unknown 10 \
      --retry-interval 20
  done
}

# Wrapper around pact_can_i_deploy with main-only guard.
# Called inside each deploy stage on main. Skips silently on feature branches.
pact_can_i_deploy_to_env() {
  local environment="$1"
  local pacticipants="$2"

  if [[ "$BRANCH" != "main" ]]; then
    echo "→ Skipping can-i-deploy to $environment (branch: $BRANCH, not main)"
    return 0
  fi

  pact_can_i_deploy "$environment" "$pacticipants"
  echo "✓ Safe to deploy to $environment"
}

# Feature branch early feedback. Checks against target environments WITHOUT
# the main-only guard. Gives developers feedback before merge: "would this
# version be safe to deploy to QA/prod?"
#
# Runs in the "post-deploy review" stage on feature branches only.
pact_can_deploy_to_upper_env() {
  local pacticipants="$1"
  shift
  local environments=("$@")

  echo "--- Early feedback: checking compatibility against deployed environments ---"
  for env in "${environments[@]}"; do
    pact_can_i_deploy "$env" "$pacticipants"
  done
  echo "✓ Compatible with all environments"
}

# Records deployment to the Broker. Main-only guard — feature branches skip.
# Guards: main branch + pacticipants defined + environment defined.
pact_record_deployment() {
  local environment="$1"
  local pacticipants="$2"

  if [[ "$BRANCH" != "main" ]]; then
    echo "→ Skipping record-deployment (branch: $BRANCH, not main)"
    return 0
  fi

  if [[ -z "$pacticipants" ]]; then
    echo "→ Skipping record-deployment (no pacticipants defined)"
    return 0
  fi

  if [[ -z "$environment" ]]; then
    echo "→ Skipping record-deployment (no environment defined)"
    return 0
  fi

  local broker_env
  broker_env=$(pact_map_environment "$environment")

  local IFS=";"
  for pacticipant in $pacticipants; do
    echo "→ Recording $pacticipant deployment to $broker_env..."
    npx pact-broker record-deployment \
      --pacticipant "$pacticipant" \
      --version "$COMMIT" \
      --environment "$broker_env" \
      --broker-base-url "$BROKER_URL" \
      --broker-token "$TOKEN"
    echo "✓ $pacticipant recorded in $broker_env"
  done
}

# =============================================================================
# Main
# =============================================================================

echo "=== Pact Deploy Gate ==="
echo "  Version: $COMMIT"
echo "  Branch:  $BRANCH"
echo ""

# Feature branches: early feedback only, no record-deployment.
# A feature branch pact is a proposal, not a deployment.
# Recording deployments from branches pollutes the Broker —
# deployedOrReleased selectors would pull branch pacts during
# provider verification, causing failures when the branch is
# reverted or merged without those changes.
if [[ "$BRANCH" != "main" ]]; then
  pact_can_deploy_to_upper_env "$PACTICIPANTS" "${ENVIRONMENTS[@]}"
  echo ""
  echo "→ Skipping record-deployment (branch: $BRANCH, not main)"
  echo "  Pacts are published and verified, but not recorded as deployed."
  echo "  record-deployment only runs after merge to main."
  exit 0
fi

# Main branch: per-environment can-i-deploy → deploy → record-deployment.
# Each environment gets its own gate and its own deployment record.
# Uses --to-environment so the Broker checks each service against
# what's actually deployed in that environment.
#
# In a multi-repo setup, each environment is a separate deploy job with
# its own ENVIRONMENT and PACTICIPANTS variables. In our Kind cluster
# there's one actual deploy, but we run the full per-environment flow
# so the Broker tracks the lifecycle (dev → qa → prod).

for ENV in "${ENVIRONMENTS[@]}"; do
  echo "--- ${ENV^^} ---"
  pact_can_i_deploy_to_env "$ENV" "$PACTICIPANTS"
  echo "→ (Kind deploy happens once — recording $ENV)"
  pact_record_deployment "$ENV" "$PACTICIPANTS"
  echo ""
done

echo "✓ All services deployed to dev + qa + prod"
