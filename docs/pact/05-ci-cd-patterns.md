# CI/CD Patterns

## Overview

To scale Pact across an organisation, standardise the CI/CD integration into reusable pipeline templates. Every team should extend the same shared jobs rather than building their own.

## The 5 Core Jobs

| Job | What It Does | Used By |
|---|---|---|
| **pact_test** | Runs consumer pact tests, generates pact files as artifacts | Consumer |
| **pact_publish** | Publishes pact files to the Broker with git SHA + branch | Consumer |
| **pact_verify** | Verifies pacts against the provider's real API, creates version if needed | Provider |
| **can_i_deploy** | Queries the Broker: "is it safe to deploy this version to this environment?" | Both |
| **record_deployment** | Tells the Broker what version is now running in which environment | Both |

## Pipeline Flow

### Consumer

```
build and test                    post-deploy review          deploy
─────────────                     ──────────────────          ──────
pact_test → pact_publish    →     can_i_deploy (qa)     →    deploy:qa (record_deployment)
                                                        →    deploy:prod (record_deployment)
```

### Provider

```
build and test                    post-deploy review                        deploy
─────────────                     ──────────────────                        ──────
pact_verify                 →     can_i_deploy (qa, staging, prod)    →    deploy:qa (record_deployment)
                                                                      →    deploy:prod (record_deployment)
```

### Combined (service is both consumer and provider)

Both flows run in the same pipeline. Each deploy job lists all pacticipant roles for that service (semicolon-separated).

## Webhook-Triggered Pipelines

When a consumer publishes a new pact, the Broker webhook triggers the provider's pipeline. These triggered pipelines should only run pact verification — block all other jobs (deploy, integration tests, etc.) from running on webhook triggers.

## Monorepo Considerations

In a monorepo with multiple stacks, map each stack to its own pacticipant names in the deploy jobs. This ensures each stack only records deployments for its own services.

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

- **Environment mapping** — translates CI account names to generic Broker environment names (e.g. `my-qa-account` → `qa`), keeping things portable
- **Create version if not exists** — ensures the provider version exists on the Broker even when there are no pacts to verify yet
- **Record deployment** — runs only on the protected main branch; maps environments and supports multiple pacticipants
- **Can-i-deploy** — checks each pacticipant against each environment with `--retry-while-unknown` to wait for pending verifications

## Adoption Checklist

### New Consumer

1. [ ] Write consumer pact tests
2. [ ] Add `test:pact` script to package.json
3. [ ] Enable `PACT_TESTING` and add pact_test, pact_publish, can_i_deploy jobs
4. [ ] Add `PACTICIPANTS` and `ENVIRONMENT` to each deploy job

### New Provider

1. [ ] Initialise the provider with the Broker — see [03-provider-initialisation.md](./03-provider-initialisation.md)
2. [ ] Write provider verification test — see [02-provider-verification.md](./02-provider-verification.md)
3. [ ] Add `test:pact:verify` script to package.json
4. [ ] Enable `PACT_TESTING` and add pact_verify, can_i_deploy jobs
5. [ ] Add `PACTICIPANTS` and `ENVIRONMENT` to each deploy job

## Best Practices

- Standardise on a shared pipeline — don't let teams roll their own pact CI jobs (see [06-repo-separation.md](./06-repo-separation.md#3-shared-provider-library-repo) for the shared library pattern)
- Block non-pact jobs on webhook-triggered pipelines to keep them fast
- Use `--retry-while-unknown` in can-i-deploy to handle async verification
- Record deployments only from the protected main branch
- Never publish verification results from local runs

## Common Mistakes

- **Missing `PACT_TESTING: "true"`** — all pact jobs silently skip
- **Wrong `PACTS_PATH`** — publish job can't find the generated pact files
- **Not adding `PACTICIPANTS` to deploy jobs** — deployments aren't recorded, can-i-deploy uses stale data
- **Running full pipeline on webhook trigger** — wastes time and can cause deploy side effects
- **Inconsistent pacticipant names** — consumer uses `my-service` but provider registers as `my-service-api`
