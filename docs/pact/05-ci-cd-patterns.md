# CI/CD Patterns

## Overview

To scale Pact across an organisation, standardise the CI/CD integration into reusable pipeline templates. Every team should extend the same shared jobs rather than building their own.

The most important principle: **`can-i-deploy` and `record-deployment` are embedded inside each deploy stage, not standalone jobs at the end of the pipeline.** Each environment gets its own gate and its own deployment record. This is the pattern that prevents the kind of Broker state pollution that breaks deployments for every team.

## The 5 Core Jobs

| Job | What It Does | Used By |
|---|---|---|
| **pact_test** | Runs consumer pact tests, generates pact files as artifacts | Consumer |
| **pact_publish** | Publishes pact files to the Broker with git SHA + branch | Consumer |
| **pact_verify** | Verifies pacts against the provider's real API, creates version if needed | Provider |
| **can_i_deploy** | Queries the Broker: "is it safe to deploy this version to this environment?" | Both |
| **record_deployment** | Tells the Broker what version is now running in which environment | Both |

## The Deploy Stage Pattern

This is the critical pattern. In production pipelines, Pact is not a separate job — it's **embedded inside each deploy stage**. Every environment deploy follows the same sequence:

```
can-i-deploy(env)  →  deploy(env)  →  record-deployment(env)
```

`can-i-deploy` gates the deploy. `record-deployment` runs after a successful deploy. Both are scoped to a single environment. This means:

- QA deploy checks compatibility with QA, deploys, records to QA
- Prod deploy checks compatibility with prod, deploys, records to prod
- If QA deploy fails, prod never runs — and the Broker knows QA wasn't updated

### Why not a standalone job?

A standalone `can-i-deploy` job at the end of the pipeline checks all environments at once, then a standalone `record-deployment` records all environments at once. This is wrong because:

- If the QA deploy succeeds but prod deploy fails, `record-deployment` still records prod — the Broker thinks prod was updated when it wasn't
- If `can-i-deploy` runs before any deploy, it checks against stale data — the previous deploy's version, not the current one
- There's no per-environment gate — a failure in one environment doesn't block the others

The embedded pattern ensures the Broker always reflects reality.

### GitHub Actions example

```yaml
# Each deploy job has the same structure, scoped to one environment
deploy-qa:
  needs: [build-and-test]
  runs-on: ubuntu-latest
  steps:
    - name: Can-i-deploy to QA
      run: |
        pact-broker can-i-deploy \
          --pacticipant service-a --version "$COMMIT" \
          --to-environment qa \
          --broker-base-url "$BROKER_URL" --broker-token "$TOKEN" \
          --retry-while-unknown 10 --retry-interval 20

    - name: Deploy to QA
      run: ./scripts/deploy.sh qa

    - name: Record deployment to QA
      run: |
        pact-broker record-deployment \
          --pacticipant service-a --version "$COMMIT" \
          --environment qa \
          --broker-base-url "$BROKER_URL" --broker-token "$TOKEN"

deploy-prod:
  needs: [deploy-qa]
  runs-on: ubuntu-latest
  steps:
    - name: Can-i-deploy to prod
      run: |
        pact-broker can-i-deploy \
          --pacticipant service-a --version "$COMMIT" \
          --to-environment prod \
          --broker-base-url "$BROKER_URL" --broker-token "$TOKEN" \
          --retry-while-unknown 10 --retry-interval 20

    - name: Deploy to prod
      run: ./scripts/deploy.sh prod

    - name: Record deployment to prod
      run: |
        pact-broker record-deployment \
          --pacticipant service-a --version "$COMMIT" \
          --environment prod \
          --broker-base-url "$BROKER_URL" --broker-token "$TOKEN"
```

### Our project simplification

We have one Kind cluster — there's no separate QA or prod environment to deploy to. So our `can-i-deploy.sh` runs all three environment checks and recordings in a single step:

```bash
for ENV in dev qa prod; do
  pact_can_i_deploy_to_env "$ENV" "$PACTICIPANTS"
  pact_record_deployment "$ENV" "$PACTICIPANTS"
done
```

Each call uses `--to-environment` to check each service against what's actually deployed in that environment — the same query a multi-repo pipeline would make. This exercises the Broker's multi-environment lifecycle (dev → qa → prod) without needing separate infrastructure. In a real project, each environment would be a separate deploy job with its own gate, as shown above.

## Monorepo Pipeline Structure

The production pipeline pattern above separates verification (build/test stage) from deployment recording (deploy stage). This means verification failure doesn't block `record-deployment` — the deploy stage runs independently if `can-i-deploy` passes.

Our monorepo pipeline now follows this pattern:

```
pact job (build & test):    consumer test → publish → verify
deploy-and-test job:        build → deploy → can-i-deploy → record-deployment → tests → chaos
```

Verification failure in the pact job doesn't block `can-i-deploy` or `record-deployment` in the deploy job. Recovery after a break-glass hotfix is a single commit — no `continue-on-error` needed.

If your pipeline can't separate stages (e.g. verification and `record-deployment` must run in the same job), the alternative is a two-commit recovery using `continue-on-error: true` on provider verification. See [06-repo-separation.md](06-repo-separation.md#previous-approach-two-commit-recovery-with-continue-on-error) for details.

See [06-repo-separation.md](06-repo-separation.md#the-real-fix-separate-stages) and [09-coordinated-breaking-changes.md](09-coordinated-breaking-changes.md#the-real-problem-pipeline-structure) for the full explanation of why this matters.

## Branch vs Main — What Runs Where

This is the rule that prevents Broker state pollution. Getting this wrong is how you end up with feature branch pacts recorded as "deployed", which breaks `can-i-deploy` for every team.

### Feature branches (dev)

Feature branches run the **test, verify, and early feedback** part of the pipeline. They do NOT deploy to real environments and do NOT record deployments.

```
pact_test → pact_publish → pact_verify → pact_can_deploy_to_upper_env
```

- Consumer tests run and pacts are published with the branch name
- Provider verification runs and results are published
- `pact_can_deploy_to_upper_env` runs as early feedback — checks each service against all environments using `--to-environment` to answer: "if this branch merged and deployed, would it be safe?"
- `record-deployment` does NOT run (nothing was deployed)

The early feedback check is informational — it tells developers whether their changes are compatible with what's currently deployed, before they merge. It uses the same `--to-environment` query as the main branch deploy gate.

The pact is published to the Broker with the branch name so the provider can verify it. But it's not recorded as deployed to any environment. This is critical — a feature branch pact is a proposal, not a deployment.

### Main branch (qa, prod)

Main branch runs the full pipeline including deployment gates and deployment recording.

```
pact_test → pact_publish → pact_verify → can-i-deploy(qa) → deploy(qa) → record-deployment(qa) → can-i-deploy(prod) → deploy(prod) → record-deployment(prod)
```

- `can-i-deploy` runs before each environment deploy
- `record-deployment` runs after each successful environment deploy
- Both are guarded by: `is_protected_branch AND is_main_branch AND pact_testing_enabled`

### The guards

Every `record-deployment` call must check:

1. **Is this the protected main branch?** — not a feature branch, not a tag
2. **Is pact testing enabled?** — the `PACT_TESTING` flag is set
3. **Are pacticipants defined?** — the `PACTICIPANTS` variable is set
4. **Is the environment defined?** — the `ENVIRONMENT` variable is set

If any guard fails, skip silently with a log message explaining why. Never fail the pipeline because pact recording was skipped — that would block deploys when pact is disabled.

```bash
pact_record_deployment() {
  if [[ "$BRANCH" != "main" ]]; then
    echo "→ Skipping record-deployment (branch: $BRANCH, not main)"
    return 0
  fi

  if [[ "$PACT_TESTING" != "true" ]]; then
    echo "→ Skipping record-deployment (PACT_TESTING not enabled)"
    return 0
  fi

  for pacticipant in $PACTICIPANTS; do
    pact-broker record-deployment \
      --pacticipant "$pacticipant" \
      --version "$COMMIT" \
      --environment "$ENVIRONMENT" \
      --broker-base-url "$BROKER_URL" ...
  done
}
```

### What happens if you record deployments from a feature branch

This is exactly what went wrong in this project. A feature branch ran `record-deployment`, which told the Broker that an experimental pact (with a `priority` field) was "deployed" to dev. When the branch was reverted, the provider verification still pulled that deployed pact via the `deployedOrReleased` selector and failed — because the provider no longer returned the `priority` field.

The fix was to add the main-only guard. But the damage was done — the Broker state was polluted and pact had to be disabled entirely until the state could be cleaned up.

In a production org with hundreds of services, this would mean `can-i-deploy` gives wrong answers to every team that depends on the affected services. Deployments get blocked. Teams raise tickets. The platform team scrambles to clean up Broker state. All because one feature branch recorded a deployment it shouldn't have.

**Rule: `record-deployment` only runs on the protected main branch, after a real deployment to a real environment.**

## Pipeline Flow

### Consumer

```
build and test                    deploy
─────────────                     ──────
pact_test → pact_publish    →     can-i-deploy(qa) → deploy:qa → record-deployment(qa)
                                  can-i-deploy(prod) → deploy:prod → record-deployment(prod)
```

### Provider

```
build and test                    deploy
─────────────                     ──────
pact_verify                 →     can-i-deploy(qa) → deploy:qa → record-deployment(qa)
                                  can-i-deploy(prod) → deploy:prod → record-deployment(prod)
```

### Combined (service is both consumer and provider)

Both flows run in the same pipeline. Each deploy job lists all pacticipant roles for that service (semicolon-separated).

## Webhook-Triggered Pipelines

When a consumer publishes a new pact, the Broker webhook triggers the provider's pipeline. These triggered pipelines should only run pact verification — block all other jobs (deploy, integration tests, etc.) from running on webhook triggers.

## Monorepo Considerations

In a monorepo with multiple stacks, map each stack to its own pacticipant names in the deploy jobs. This ensures each stack only records deployments for its own services.

**Monorepo `can-i-deploy`:** In a monorepo, all services share a commit SHA. Each service is checked independently against each environment using `--to-environment` — the same query a multi-repo pipeline would make:

```bash
for service in service-a service-b service-c; do
  pact-broker can-i-deploy \
    --pacticipant "$service" \
    --version "$COMMIT" \
    --to-environment prod \
    --broker-base-url "$BROKER_URL" ...
done
```

This asks: "is this version of service-a compatible with what's deployed in prod?" — repeated for each service. The Broker checks each service against the other services' deployed versions.

In multi-repo, each service checks independently against what's deployed:

```bash
pact-broker can-i-deploy \
  --pacticipant service-a --version "$COMMIT" \
  --to-environment prod \
  --broker-base-url "$BROKER_URL" ...
```

The query is identical — only the trigger differs (same pipeline vs separate pipelines).

## Required Variables

| Variable | Where | Description |
|---|---|---|
| `PACT_TESTING` | Top-level | `"true"` to enable all pact jobs |
| `PACTICIPANTS` | Top-level or per deploy job | Semicolon-separated list of pacticipant names |
| `PACTICIPANT_NAME` | pact_test, pact_publish | The consumer name for this set of pacts |
| `PACTS_PATH` | pact_test, pact_publish | Path to generated pact JSON files |
| `ENVIRONMENT` | can_i_deploy, deploy jobs | Target environment name |

Broker credentials (`PACT_BROKER_USERNAME`, `PACT_BROKER_PASSWORD`) should come from your CI secrets store, never hardcoded.

## Shared Helper Functions

The reusable pipeline should provide these shell functions:

| Function | What it does | When it runs |
|---|---|---|
| `pact_map_environment` | Translates CI account names to Broker environment names (e.g. `my-qa-account` → `qa`) | Called by other functions |
| `pact_can_i_deploy` | Core: checks each pacticipant against a target environment using `--to-environment` with `--retry-while-unknown` | Called by the two wrappers below |
| `pact_can_i_deploy_to_env` | Wrapper: adds main-only guard, then calls `pact_can_i_deploy`. Embedded inside each deploy stage as a gate before the actual deploy | Main branch only |
| `pact_can_deploy_to_upper_env` | Wrapper: no main guard, calls `pact_can_i_deploy` against all environments. Gives feature branch developers early feedback: "would this be safe to deploy?" | Feature branches only |
| `pact_record_deployment` | Records deployment to the Broker. Main-only guard — skips silently on feature branches. Embedded inside each deploy stage after the actual deploy | Main branch only |
| `pact_create_version_if_does_not_exist` | Ensures the provider version exists on the Broker even when there are no pacts to verify yet | Build stage (after verification) |

## Adoption Checklist

**Order matters:** Provider goes to main first (fully merged and deployed), then consumer starts on a branch. See [08-adoption-plan.md](./08-adoption-plan.md) for the full rollout sequence.

### New Provider (do this first)

1. [ ] Initialise the provider with the Broker — see [03-provider-initialisation.md](./03-provider-initialisation.md)
2. [ ] Write provider verification test — see [02-provider-verification.md](./02-provider-verification.md)
3. [ ] Add `test:pact:verify` script to package.json
4. [ ] Enable `PACT_TESTING` and add pact_verify to the build stage
5. [ ] Add `PACTICIPANTS` and `ENVIRONMENT` to each deploy job
6. [ ] Embed `can-i-deploy` and `record-deployment` inside each deploy stage
7. [ ] Merge to main and deploy — pipeline is green with zero pacts (`failIfNoPactsFound: false`)

### New Consumer (do this after provider is on main)

1. [ ] Write consumer pact tests
2. [ ] Add `test:pact` script to package.json
3. [ ] Enable `PACT_TESTING` and add pact_test, pact_publish to the build stage
4. [ ] Add `PACTICIPANTS` and `ENVIRONMENT` to each deploy job
5. [ ] Embed `can-i-deploy` and `record-deployment` inside each deploy stage

## Best Practices

- Standardise on reusable pipeline templates — don't let teams roll their own pact CI jobs (see [06-repo-separation.md](./06-repo-separation.md#3-shared-provider-library-repo) for the shared library pattern)
- Embed `can-i-deploy` and `record-deployment` inside each deploy stage — never as standalone jobs
- Block non-pact jobs on webhook-triggered pipelines to keep them fast
- Use `--retry-while-unknown` in can-i-deploy to handle async verification
- Record deployments only from the protected main branch, after a real deployment
- Never publish verification results from local runs
- Feature branches: test, publish, verify — but never `can-i-deploy` or `record-deployment`

## Common Mistakes

- **Recording deployments from feature branches** — pollutes the Broker with experimental pacts as "deployed", breaks `can-i-deploy` for every team that depends on the affected services. This is the single most dangerous mistake in Pact CI/CD
- **Standalone `record-deployment` job** — runs after all deploys, records all environments at once. If one environment fails, the Broker still thinks it was updated. Embed inside each deploy stage instead
- **Missing `PACT_TESTING: "true"`** — all pact jobs silently skip
- **Wrong `PACTS_PATH`** — publish job can't find the generated pact files
- **Not adding `PACTICIPANTS` to deploy jobs** — deployments aren't recorded, can-i-deploy uses stale data
- **Running full pipeline on webhook trigger** — wastes time and can cause deploy side effects
- **Inconsistent pacticipant names** — consumer uses `my-service` but provider registers as `my-service-api`
- **No `--retry-while-unknown` on can-i-deploy** — in multi-repo, the provider may not have verified the pact yet. Without retry, `can-i-deploy` fails immediately instead of waiting
