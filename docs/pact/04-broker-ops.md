# Broker Operations

## Infrastructure Overview

A typical Pact Broker deployment consists of:

- A **container** running the `pactfoundation/pact-broker` image from Docker Hub
- A **Postgres database** as the backing store
- A **load balancer** in front of the container
- A **DNS record** pointing to the load balancer
- **Basic auth** with separate read-write and read-only credentials

## Local Kind Deployment

This project runs the Pact Broker locally on a Kind cluster. The setup lives in `k8s/`:

| Manifest | What it creates |
|---|---|
| `postgres.yaml` | Secret (credentials), PVC, Deployment, ClusterIP Service |
| `pact-broker.yaml` | Deployment, NodePort Service (`pact-broker-svc`) |

### Prerequisites

- Docker running
- `kind` and `kubectl` installed (`brew install kind kubectl`)

### Setup Steps

```bash
# 1. Create the cluster (maps port 30080 to localhost)
kind create cluster --config kind-config.yaml

# 2. Create the Secret from .env (cp .env.example .env first)
./scripts/create-secret.sh

# 3. Deploy Postgres and wait for it
kubectl apply -f k8s/postgres.yaml
kubectl wait --for=condition=ready pod -l app=postgres --timeout=60s

# 4. Deploy Pact Broker
kubectl apply -f k8s/pact-broker.yaml
kubectl wait --for=condition=ready pod -l app=pact-broker --timeout=120s

# 5. Access the Broker
open http://localhost:30080
```

### Access

| | |
|---|---|
| URL | `http://localhost:30080` |
| Read-write user | `pact_user` / (see `postgres-credentials` Secret) |
| Read-only user | `read_user` / (see `postgres-credentials` Secret) |
| Heartbeat | `GET /diagnostic/status/heartbeat` |

The port stays open as long as the Kind cluster is running. Tear down with `kind delete cluster`.

### ⚠️ Service Naming Gotcha

The Kubernetes Service for the Pact Broker is named `pact-broker-svc`, **not** `pact-broker`. This is intentional.

Kubernetes auto-injects environment variables for every Service in the namespace using the Service name as a prefix (e.g. `PACT_BROKER_PORT`, `PACT_BROKER_SERVICE_HOST`). If the Service is named `pact-broker`, the auto-generated `PACT_BROKER_PORT` env var (`tcp://10.96.x.x:9292`) collides with the Pact Broker application's own config, which expects `PACT_BROKER_PORT` to be an integer. This causes Puma to crash with:

```
ArgumentError: invalid value for Integer(): "tcp://10.96.x.x:9292"
```

Renaming the Service to `pact-broker-svc` avoids the collision.

## Upgrading the Broker (Production)

1. Check the current image version in your infrastructure config
2. Check the latest tag on [Docker Hub](https://hub.docker.com/r/pactfoundation/pact-broker/tags)
3. Review the [changelog](https://github.com/pact-foundation/pact_broker/blob/master/CHANGELOG.md) for breaking changes between the two versions
4. Snapshot the database before deploying
5. Update the image tag and deploy
6. Verify the Broker is healthy: `GET /diagnostic/status/heartbeat`
7. Confirm the version number in the Broker UI

If something goes wrong, restore the database snapshot and roll back the image tag.

## Credential Management

The Broker typically has two sets of credentials:

| User | Purpose | Access Level |
|---|---|---|
| Automation user | CI/CD pipelines (publish, verify, can-i-deploy) | Read-write |
| Read-only user | Browsing the Broker UI, viewing contracts | Read-only |

Best practices:
- Store credentials in a secrets manager (e.g. Vault, cloud-native secrets store)
- Rotate credentials periodically
- Never hardcode credentials in pipeline configs — reference them from the secrets store
- Use the read-only user for any non-automated access

## Database Management

### Backups

- Enable automated daily backups on the Postgres instance
- Take a manual snapshot before any Broker upgrade or major change
- Test restores periodically to ensure backups are valid

### Maintenance

- Enable auto minor version upgrades on the database engine
- Monitor disk usage — pact files and verification results accumulate over time
- Consider enabling multi-AZ for production resilience

## Managing Environments

Register your deployment environments in the Broker:

```bash
pact-broker create-environment \
  --name dev \
  --broker-base-url "$PACT_BROKER_URL" \
  --broker-username "$PACT_BROKER_USERNAME" \
  --broker-password "$PACT_BROKER_PASSWORD"
```

Typical environments: `dev`, `qa`, `staging`, `prod`.

After each deployment, record it:

```bash
pact-broker record-deployment \
  --pacticipant <service-name> \
  --version <git-sha> \
  --environment <environment> \
  --broker-base-url "$PACT_BROKER_URL" \
  --broker-username "$PACT_BROKER_USERNAME" \
  --broker-password "$PACT_BROKER_PASSWORD"
```

## Managing Webhooks

### List Webhooks

```bash
pact-broker list-webhooks \
  --broker-base-url "$PACT_BROKER_URL" \
  --broker-username "$PACT_BROKER_USERNAME" \
  --broker-password "$PACT_BROKER_PASSWORD"
```

### Update a Webhook

Use the same `create-or-update-webhook` command with the existing UUID:

```bash
pact-broker create-or-update-webhook \
  --uuid "<existing-webhook-id>" \
  "<trigger-url>" \
  --broker-base-url "$PACT_BROKER_URL" \
  --broker-username "$PACT_BROKER_USERNAME" \
  --broker-password "$PACT_BROKER_PASSWORD" \
  --provider "<provider-name>" \
  --description "<provider-name> provider" \
  --contract_requiring_verification_published \
  -X POST
```

### Test a Webhook

```bash
pact-broker test-webhook \
  --uuid "<webhook-id>" \
  --broker-base-url "$PACT_BROKER_URL" \
  --broker-username "$PACT_BROKER_USERNAME" \
  --broker-password "$PACT_BROKER_PASSWORD"
```

## Cleaning Up

### Remove Old Versions

Over time, old pacticipant versions accumulate. Clean them up:

```bash
pact-broker delete-branch \
  --pacticipant <service-name> \
  --branch <old-branch> \
  --broker-base-url "$PACT_BROKER_URL" \
  --broker-username "$PACT_BROKER_USERNAME" \
  --broker-password "$PACT_BROKER_PASSWORD"
```

### Remove a Pacticipant

If a service is decommissioned:

```bash
pact-broker delete-pacticipant \
  --name <service-name> \
  --broker-base-url "$PACT_BROKER_URL" \
  --broker-username "$PACT_BROKER_USERNAME" \
  --broker-password "$PACT_BROKER_PASSWORD"
```

This removes all pacts, verifications, and webhooks associated with that pacticipant.

## Monitoring

### Health Check

```
GET /diagnostic/status/heartbeat
```

Returns `200 OK` if the Broker is healthy. Use this for load balancer health checks.

### Broker UI

The Broker UI shows:
- All pacticipants and their latest versions
- Contract status (verified, failed, unverified)
- Dependency graph (who talks to whom)
- Webhook execution logs
- Environment deployment history

### Key Things to Watch

- **Unverified pacts** — a consumer published a pact but the provider hasn't verified it yet
- **Failed verifications** — a provider's API doesn't match the consumer's expectations
- **Webhook failures** — the Broker couldn't trigger the provider's pipeline
- **Stale deployments** — `record-deployment` isn't being called after deploys, so `can-i-deploy` uses outdated data

## Troubleshooting

### can-i-deploy says "no deployed version found"

The Broker doesn't know what version is deployed to the target environment. Fix by running `record-deployment` for the current version.

### Webhook not triggering provider verification

- Check webhook execution logs in the Broker UI
- Verify the trigger token is still valid
- Ensure the webhook URL and project ID are correct
- Test the webhook manually using `test-webhook`

### Verification passes locally but fails in CI

- Check that `PACT_BROKER_USERNAME` and `PACT_BROKER_PASSWORD` are set in CI
- Ensure the provider name matches exactly between consumer tests and the Broker
- Verify the `PACT_URL` variable is being passed correctly from the webhook

### Pact file shows "undefined" as consumer name

The consumer name isn't being set in the test config. Ensure the `consumer` field is populated (often from an environment variable like `PACTICIPANT_NAME`).

## Further Reading

- [Pact Broker CLI Documentation](https://docs.pact.io/pact_broker/client_cli)
- [Pact Broker API Documentation](https://docs.pact.io/pact_broker)
- [Webhooks](https://docs.pact.io/pact_broker/webhooks)
- [Can-I-Deploy](https://docs.pact.io/pact_broker/can_i_deploy)
- [Recording Deployments](https://docs.pact.io/pact_broker/recording_deployments_and_releases)
