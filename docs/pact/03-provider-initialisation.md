# Provider Initialisation

## Why a Separate Repo?

Provider initialisation is a **one-time setup per provider**, not something that runs on every commit. It makes sense to keep it in its own repo because:

- Any team can run it to onboard their provider — they just fill in variables and trigger the pipeline
- It keeps provider repos clean — no initialisation scripts mixed in with application code
- Changes to the initialisation process are versioned and reviewed in one place

The repo contains a set of shell scripts that call the [Pact Broker CLI](https://docs.pact.io/pact_broker/client_cli) to register a provider and configure webhooks.

## In Short

The Pact Broker needs to know a provider exists before anyone can deploy against it. Initialisation registers the provider and records it as "deployed" to every environment (dev, qa, staging, prod). This gives `can-i-deploy` a green baseline.

Without this, the first time the provider or any of its consumers tries to deploy, `can-i-deploy` fails because the Broker has no record of the provider — even if the service is already running fine in every environment.

Initialisation also creates a webhook so that whenever a consumer publishes a new pact, the provider's pipeline is automatically triggered to verify it.

```
validate inputs → create provider → record deployments → create webhook
```

This follows the [Pact Nirvana](https://docs.pact.io/pact_nirvana) recommended approach for reaching a fully automated contract testing workflow.

## What You Need

This pipeline is triggered **manually** from your CI platform (GitHub Actions, GitLab CI, etc.) by filling in variables before hitting run. You don't push to main — you run it on a branch with the variables populated in the CI UI.

This is important because without initialisation, `can-i-deploy` has no baseline. By running this first — even from a branch — you register the provider and record deployments so that `can-i-deploy` returns green from day one, before any real pipeline touches main.

| Variable | Description | Example |
|---|---|---|
| `PROVIDER` | The provider service name | `my-provider-service` |
| `BRANCH` | Your default branch name | `main` |
| `COMMIT` | HEAD short SHA (8 chars) of your default branch | `dee1780a` |
| `PROJECT_ID` | Your CI/CD project identifier | `26800725` |
| `TOKEN` | A CI/CD pipeline trigger token | `<trigger-token>` |
| `CUSTOM_WEBHOOK_ID` | Optional UUID for the webhook (auto-generated if omitted) | `<uuid>` |

The commit SHA must be from an existing good commit that has already been deployed through all environments. You're telling the Broker: "this version is known-good and already live everywhere — use it as the starting point."

## The 4 Steps

### Step 1: Create the Provider

Registers the provider as a pacticipant in the Broker and associates it with a version and branch:

```bash
pact-broker create-or-update-version \
  --broker-base-url "$PACT_BROKER_URL" \
  --broker-username "$PACT_BROKER_USERNAME" \
  --broker-password "$PACT_BROKER_PASSWORD" \
  --pacticipant "$PROVIDER" \
  --version "$COMMIT" \
  --branch "$BRANCH"
```

This tells the Broker: "this provider exists, here is its current version."

### Step 2: Record Deployments

This step tells the Broker that this provider version is "deployed" to every environment. It runs `record-deployment` once per environment — ideally in parallel so it's fast:

```bash
# Runs once per environment (dev, qa, staging, prod) — in parallel(CI)
pact-broker record-deployment \
  --broker-base-url "$PACT_BROKER_URL" \
  --broker-username "$PACT_BROKER_USERNAME" \
  --broker-password "$PACT_BROKER_PASSWORD" \
  --pacticipant "$PROVIDER" \
  --version "$COMMIT" \
  --environment "$ENV"
```

In your CI pipeline, this is typically a separate stage (e.g. `deploy`) that runs as a parallel matrix across all environments:

```yaml
# Pseudocode — adapt to your CI platform
record-deployment:
  stage: deploy
  script: ./record-deployment.sh
  parallel:
    matrix:
      - ENV: DEV
      - ENV: QA
      - ENV: STAGING
      - ENV: PROD
```

This is critical — without it, `can-i-deploy` reports "no deployed version found" and blocks all future deployments for this provider and its consumers.

### Step 3: Generate a Webhook ID

```bash
WEBHOOK_ID="${CUSTOM_WEBHOOK_ID:-$(uuidgen)}"
```

Store this ID — you'll need it to update the webhook later.

### Step 4: Create the Webhook

This is the key step. It sets up a webhook that **automatically triggers the provider's CI pipeline** whenever a consumer publishes a pact that needs verifying:

```bash
pact-broker create-or-update-webhook \
  --uuid "$WEBHOOK_ID" \
  "<ci-trigger-url>" \
  --broker-base-url "$PACT_BROKER_URL" \
  --broker-username "$PACT_BROKER_USERNAME" \
  --broker-password "$PACT_BROKER_PASSWORD" \
  --provider "$PROVIDER" \
  --description "$PROVIDER provider" \
  --contract_requiring_verification_published \
  -X POST
```

The `--contract_requiring_verification_published` flag is the [Pact-recommended webhook event](https://docs.pact.io/pact_broker/webhooks#the-contract-requiring-verification-published-event). It fires when:

- A consumer publishes a new or changed pact that this provider hasn't verified yet
- A new provider version exists that hasn't verified an existing pact

It does **not** fire when a consumer republishes an identical pact that's already been verified — avoiding unnecessary pipeline runs.

The webhook URL passes variables to the triggered pipeline so it knows what to verify:
- `PACT_URL` — the specific pact to verify
- `PACT_PROVIDER_VERSION` — the provider version
- `PACT_PROVIDER_BRANCH` — the provider branch

## Dry Run Mode

Always do a dry run first. The pipeline should support a `DRY_RUN` flag that validates inputs and logs what it would do without creating anything on the Broker:

```bash
if [[ "$DRY_RUN" != 'true' ]]; then
  pact-broker create-or-update-version ...
else
  echo "[DRY_RUN] would create provider $PROVIDER"
fi
```

## Repo Structure

How you structure the repo is up to you — shell scripts, a Makefile, or even a single CLI wrapper. The important thing is that the 4 steps run in order and the pipeline is manual-trigger only.

The [Pact Broker CLI](https://docs.pact.io/pact_broker/client_cli) provides all the commands you need (`create-or-update-version`, `record-deployment`, `create-or-update-webhook`), so the scripts are thin wrappers around those.

A common approach is one script per step:
- A validation script that checks all required variables are set and correctly formatted
- A script per Pact Broker CLI command (create version, record deployment, create webhook)
- A CI pipeline file that runs them in sequence, triggered manually with input variables

You could also combine them into a single script or a Makefile — whatever fits your team's workflow.

## After Initialisation: Wiring Into Your CI/CD Pipeline

Initialisation is a one-off. But your provider's own CI/CD pipeline needs ongoing pact steps baked into its deploy stages. Here's where they go:

```
build and test          pre-deploy              deploy              post-deploy
──────────────          ──────────              ──────              ───────────
pact_verify        →    can-i-deploy (env)  →   deploy to env  →   record-deployment (env)
```

### 1. Verify pacts (build and test stage)

Run provider verification tests before anything deploys. See [02-provider-verification.md](./02-provider-verification.md).

### 2. Can-i-deploy gate (pre-deploy stage)

Before each environment deploy, check the Broker:

```bash
pact-broker can-i-deploy \
  --pacticipant "$PROVIDER" \
  --version "$COMMIT" \
  --to-environment "$ENV" \
  --broker-base-url "$PACT_BROKER_URL" \
  --broker-username "$PACT_BROKER_USERNAME" \
  --broker-password "$PACT_BROKER_PASSWORD"
```

This blocks the deploy if contracts aren't compatible. Run it before every environment (qa, staging, prod).

### 3. Deploy (deploy stage)

Your normal deployment step — no pact changes here.

### 4. Record deployment (post-deploy stage)

After a successful deploy, tell the Broker what's now running:

```bash
pact-broker record-deployment \
  --pacticipant "$PROVIDER" \
  --version "$COMMIT" \
  --environment "$ENV" \
  --broker-base-url "$PACT_BROKER_URL" \
  --broker-username "$PACT_BROKER_USERNAME" \
  --broker-password "$PACT_BROKER_PASSWORD"
```

This is critical — without it, `can-i-deploy` uses stale data and future deployments (yours and your consumers') may be blocked.

Only record deployments from the protected main branch, not feature branches.

### 5. Consumers can now publish pacts

With the webhook in place, any consumer that publishes a pact against this provider will automatically trigger verification. See [01-consumer-guide.md](./01-consumer-guide.md) and [05-ci-cd-patterns.md](./05-ci-cd-patterns.md) for the full pipeline patterns.

## Best Practices

- Keep initialisation in a separate repo — it's a shared tool, not part of any one service
- Always dry run first
- Use the git short SHA (8 chars) as the version — it's traceable and unique
- Store the webhook ID — you'll need it for updates
- Use the same provider name everywhere (consumer tests, verification tests, Broker)

## Common Mistakes

- **Using a commit that hasn't been deployed** — `can-i-deploy` fails because the Broker thinks that version isn't in any environment
- **Mismatched provider names** — consumer uses `my-service` but you register `my-service-api`, contracts won't link
- **Forgetting the webhook** — without it, verification only runs when the provider's own pipeline runs
- **Not recording deployments** — the Broker can't answer `can-i-deploy` without knowing what's deployed where

## Further Reading

- [Pact Nirvana — the recommended CI/CD setup](https://docs.pact.io/pact_nirvana)
- [Pact Broker Webhooks](https://docs.pact.io/pact_broker/webhooks)
- [contract_requiring_verification_published event](https://docs.pact.io/pact_broker/webhooks#the-contract-requiring-verification-published-event)
- [Recording Deployments](https://docs.pact.io/pact_broker/recording_deployments_and_releases)
