#!/usr/bin/env bash
set -euo pipefail

# Creates the postgres-credentials K8s Secret from .env
# Usage: ./scripts/create-secret.sh

ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env file not found at $ENV_FILE"
  echo "Copy .env.example to .env and fill in your passwords."
  exit 1
fi

source "$ENV_FILE"

kubectl create secret generic postgres-credentials \
  --from-literal=POSTGRES_USER="$POSTGRES_USER" \
  --from-literal=POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  --from-literal=POSTGRES_DB="$POSTGRES_DB" \
  --from-literal=PACT_BROKER_AUTH_USERNAME="$PACT_BROKER_AUTH_USERNAME" \
  --from-literal=PACT_BROKER_AUTH_PASSWORD="$PACT_BROKER_AUTH_PASSWORD" \
  --from-literal=PACT_BROKER_AUTH_RO_USERNAME="$PACT_BROKER_AUTH_RO_USERNAME" \
  --from-literal=PACT_BROKER_AUTH_RO_PASSWORD="$PACT_BROKER_AUTH_RO_PASSWORD" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Secret postgres-credentials created/updated."
