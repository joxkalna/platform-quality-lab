# Repo Separation — Monorepo vs Multi-Repo Pact

## Why This Document Exists

This project is a monorepo — consumer, provider, broker infrastructure, and initialisation scripts all live together. That's fine for learning, but in a large organisation each of these would be a separate repo owned by a different team.

This document maps every piece of the monorepo setup to its multi-repo equivalent, so the patterns here can be lifted directly into a real org.

## The 5 Repos

In a production org, Pact infrastructure is typically split across 5 types of repo:

```
┌─────────────────────────────┐
│  Broker Infrastructure      │  ← Terraform / IaC, owned by platform team
│  (infra-pact-broker)        │
└─────────────────────────────┘
              │
              ▼
┌─────────────────────────────┐
│  Provider Initialisation    │  ← Shell scripts + CI, shared tool
│  (initialise-pact-provider) │
└─────────────────────────────┘
              │
              ▼
┌─────────────────────────────┐
│  Shared Provider Library    │  ← npm package, wraps @pact-foundation/pact
│  (pact-provider)            │
└─────────────────────────────┘
              │
       ┌──────┴──────┐
       ▼              ▼
┌─────────────┐ ┌─────────────┐
│  Consumer   │ │  Provider   │  ← Application repos, owned by product teams
│  Service    │ │  Service    │
└─────────────┘ └─────────────┘
```

### 1. Broker Infrastructure Repo

**What it is:** Terraform (or equivalent IaC) that provisions the Pact Broker and its backing database.

**What it creates:**
- Container orchestration cluster + service running `pactfoundation/pact-broker`
- Managed Postgres instance as the backing store
- Load balancer in front of the service
- DNS record (e.g. `pact-broker.example.io`)
- Secrets store entries for credentials (automation user + read-only user)
- Network rules restricting access by IP
- Random password generation for broker auth credentials

**Key details:**
- The Broker image version is pinned (e.g. `pactfoundation/pact-broker:2.102.2.0`) — upgrades are deliberate, with a database snapshot taken first
- Two sets of credentials: an automation user (read-write, used by CI pipelines) and a read-only user (for browsing the UI)
- Credentials are stored in a secrets store, never in code or pipeline configs
- The load balancer is internal (private IP) — access is restricted to the corporate network
- Daily automated backups on the database, multi-AZ for resilience
- The container service needs network access to pull the Broker image from Docker Hub

**Monorepo equivalent:** `k8s/postgres.yaml` + `k8s/pact-broker.yaml` + `scripts/create-secret.sh`

**What changes in a real org:**
| Monorepo (Kind) | Production |
|---|---|
| K8s manifests applied manually | IaC managing container orchestration |
| NodePort on localhost:30080 | Load balancer + DNS (`pact-broker.example.io`) |
| `.env` file with passwords | Secrets store (Vault, cloud-native, etc.) |
| `imagePullPolicy: IfNotPresent` | Image pulled from Docker Hub by orchestrator |
| Single namespace, no network policy | Security groups, private subnets, IP restrictions |
| PVC on Kind's local storage | Managed Postgres with automated backups + multi-AZ |

### 2. Provider Initialisation Repo

**What it is:** A set of shell scripts and a CI pipeline that registers a new provider with the Pact Broker. Run once per provider, triggered manually.

**What it does (3 steps):**
1. **Validate inputs** — checks all required variables are set and correctly formatted (provider name, branch, 8-char commit SHA)
2. **Create provider** — `pact-broker create-or-update-version` registers the provider as a pacticipant
3. **Record deployments** — `pact-broker record-deployment` for each environment (dev, qa, staging, prod) in parallel, giving `can-i-deploy` a green baseline

Webhook creation is a separate step done later, after both provider and consumer are working end-to-end. See [08-adoption-plan.md Phase 4](./08-adoption-plan.md#phase-4-webhooks-multi-repo-only).

**Key details:**
- The pipeline is **manual-trigger only** — you fill in variables in the CI UI and hit run
- Supports a `DRY_RUN` mode that validates inputs and logs what it would do without touching the Broker
- The commit SHA must be from an existing deployed commit — you're telling the Broker "this version is already live everywhere"
- The webhook URL points at the provider's CI pipeline trigger endpoint, passing `PACT_URL`, `PACT_PROVIDER_VERSION`, and `PACT_PROVIDER_BRANCH` as variables
- Each script is independently testable — BATS tests mock the `pact` CLI and assert the correct arguments are passed
- The webhook ID is either user-supplied or auto-generated via `uuidgen` — stored as a CI artifact for future updates

**Repo structure:**
```
initialise-pact-provider/
├── src/
│   ├── validate_variables.sh
│   ├── create_provider.sh
│   ├── create_deployment.sh
│   ├── create_webhook.sh
│   ├── generate_webhook_id.sh
│   └── tests/
│       ├── validate_variables.bats
│       ├── create_provider.bats
│       ├── create_deployment.bats
│       ├── create_webhook.bats
│       └── generate_webhook_id.bats
└── .github/workflows/initialise.yml  (or equivalent CI config)
```

**CI pipeline stages:**
```
validate → test → initialise (create provider) → deploy (record deployments, parallel matrix) → generate-webhook-id → webhook (create webhook)
```

**Monorepo equivalent:** `scripts/pact/initialise-provider.sh` (not yet created)

**What changes in a real org:**
| Monorepo | Production |
|---|---|
| Single script, run locally | Separate repo with CI pipeline, manual trigger |
| One environment (`local`) | Parallel matrix across dev, qa, staging, prod |
| No webhook needed (same pipeline) | Webhook triggers provider's CI pipeline |
| No validation (you control everything) | Strict input validation (SHA length, UUID format) |
| No dry run needed | Dry run mode is essential — mistakes are hard to undo |
| No BATS tests on the scripts | Every script has BATS tests that mock the pact CLI |

### 3. Shared Provider Library Repo

**What it is:** An internal npm package (e.g. `@myorg/pact-provider`) that wraps `@pact-foundation/pact` with organisation defaults baked in.

**Why it exists:**
- Every provider team would otherwise copy-paste the same Verifier config (broker URL, consumer version selectors, pending pacts, WIP pacts)
- When the org changes a default (e.g. adds a new consumer version selector), one package update propagates to all providers
- It handles edge cases that individual teams shouldn't have to think about (e.g. multi-provider repos where a webhook triggers verification for the wrong provider)

**What it provides:**

Two exported functions:
- `verifyProvider(options, customOptions?)` — for HTTP-based providers
- `verifyMessageProvider(options, customOptions?)` — for event-driven providers (message pacts)

Both functions:
1. Hardcode the broker URL (one source of truth)
2. Set `enablePending: true` and sensible `consumerVersionSelectors` (`mainBranch`, `deployedOrReleased`, `matchingBranch`)
3. Set `failIfNoPactsFound: false` — so providers can be initialised before any consumer publishes a pact (avoids chicken-and-egg)
4. Branch between webhook-triggered runs (`pactUrl` set → verify that specific pact) and regular builds (fetch all pacts from broker)
5. Include the `ensurePactIsForProvider` workaround — when a repo has multiple providers and a webhook fires, it checks the pact URL to skip verification if the pact isn't for this provider

**The `ensurePactIsForProvider` workaround:**
```typescript
// Pact Broker URLs look like: .../provider/my-service/consumer/other-service/...
// Extract the provider name from the URL and compare
const matchResult = pactUrl.match(/(?<=\/provider\/)[^/]+/)
return matchResult?.[0] === provider
```
This is needed because in a multi-provider repo, a webhook for provider A also triggers the pipeline for provider B. Without this check, provider B would try to verify a pact meant for provider A and fail.

**Package structure:**
```
pact-provider/
├── src/
│   ├── index.ts                          # Exports verifyProvider + verifyMessageProvider
│   └── providers/
│       ├── config.ts                     # Broker URL (single source of truth)
│       ├── http-provider-verifier.ts     # HTTP verification wrapper
│       ├── message-provider-verifier.ts  # Message verification wrapper
│       ├── ensure-pact-is-for-provider.ts
│       └── __tests__/
│           ├── http-provider-verifier.spec.ts
│           ├── message-provider-verifier.spec.ts
│           └── ensure-pact-is-for-provider.spec.ts
├── package.json    # Published as @myorg/pact-provider
└── tsconfig.json
```

**How a provider uses it:**
```typescript
import { verifyProvider } from '@myorg/pact-provider'

await verifyProvider({
  provider: 'my-service',
  branch: process.env.GIT_BRANCH!,
  version: process.env.GIT_SHORT_SHA!,
  providerUrl: 'http://localhost:8000',
  pipelineExecution: process.env.CI === 'true',
  pactUrl: process.env.PACT_URL,
  workInProgressPactsSince: '2022-08-01',
  authentication: {
    username: process.env.PACT_BROKER_USERNAME!,
    password: process.env.PACT_BROKER_PASSWORD!,
  },
})
```

No broker URL, no consumer version selectors, no pending pact config — the shared package handles all of it.

**Monorepo equivalent:** `tests/pact/helpers/verifier.ts` (inline module, not a published package)

**What changes in a real org:**
| Monorepo | Production |
|---|---|
| Local helper module | Published npm package on private registry |
| Broker URL is `localhost:30080` | Broker URL hardcoded in package (`pact-broker.example.io`) |
| No multi-provider workaround needed | `ensurePactIsForProvider` handles multi-provider repos |
| No message provider support needed | Both HTTP and message verifiers exported |
| Updated by editing the file | Versioned with changesets, semver, changelog |

### 4. Consumer Service Repo

**What it is:** An application repo that makes HTTP requests to other services. The consumer defines the contract.

**Pact-specific files in the repo:**
```
my-consumer-service/
├── src/
│   └── ...                              # Application code
├── pact/
│   └── pacts/                           # Generated pact JSON files (gitignored, CI artifact)
├── src/__tests__/
│   └── my-provider.pact.spec.ts         # Consumer pact test
├── jest.pact.config.js                  # Separate test config for pact tests
└── package.json                         # test:pact script
```

**Consumer pact test pattern:**
```typescript
pactWith(
  {
    consumer: process.env.PACTICIPANT_NAME,  // Set by CI pipeline
    provider: 'the-provider-service',
    logLevel: 'warn',
  },
  interaction => {
    interaction('a request for data', ({ provider, execute }) => {
      beforeEach(() =>
        provider
          .given('data exists')
          .uponReceiving('a request for data')
          .withRequest({ method: 'GET', path: '/api/data' })
          .willRespondWith({
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: MatchersV3.like({ id: 1, name: 'example' }),
          })
      )

      execute('returns the data', async mockServer => {
        // Call your REAL code, pointed at the mock server
        const result = await myApiClient.getData(mockServer.url)
        expect(result).toEqual({ id: expect.any(Number), name: expect.any(String) })
      })
    })
  }
)
```

**Key details:**
- The consumer name comes from `PACTICIPANT_NAME` env var — set by the CI pipeline, not hardcoded
- The test calls the real client code, not a reimplementation — the mock server stands in for the provider
- Pact tests have their own config (`jest.pact.config.js` or `vitest.pact.config.mts`) with a longer timeout (30s)
- Generated pact files go to `pact/pacts/` — these are CI artifacts, not committed to git
- Use `MatchersV3` (like, arrayContaining, eachLike) instead of exact values — keeps contracts flexible

**CI pipeline additions:**
```yaml
# In the consumer's CI config
variables:
  PACT_TESTING: "true"
  PACTICIPANTS: "my-consumer-service"

pact_test:
  uses: ./.github/workflows/pact-test.yml  # From shared pipeline templates
  with:
    pacticipant_name: "my-consumer-service"
    pacts_path: "pact/pacts"

pact_publish:
  uses: ./.github/workflows/pact-publish.yml
  with:
    pacticipant_name: "my-consumer-service"
    pacts_path: "pact/pacts"

can_i_deploy:
  uses: ./.github/workflows/pact-can-i-deploy.yml
  with:
    environment: qa
```

**Monorepo equivalent:** `tests/pact/consumer/` (Service A's consumer tests)

### 5. Provider Service Repo

**What it is:** An application repo that serves HTTP endpoints consumed by other services. The provider verifies the contract.

**Pact-specific files in the repo:**
```
my-provider-service/
├── src/
│   ├── handler.ts                       # Real handler code
│   └── __tests__/
│       └── pact/
│           ├── set-env-vars.ts          # Git SHA/branch for local runs
│           └── my-service.verifier.spec.ts
├── vitest.pact.config.mts               # Separate pact test config
└── package.json                         # test:pact:verify script
```

**Provider verification test pattern:**
```typescript
import http from 'http'
import { verifyProvider } from '@myorg/pact-provider'
import { handler } from '../../handler'

describe('Pact Verification', () => {
  let server: http.Server

  beforeAll(() => {
    // Start a real HTTP server using your REAL handler code
    server = http.createServer((req, res) => {
      // Route to your real handlers
    })
    server.listen(8000)
  })

  afterAll(() => server.close())

  it('validates expectations on the provider', async () => {
    const branch = process.env.CI_MERGE_REQUEST
      ? process.env.GIT_BRANCH
      : process.env.GIT_DEFAULT_BRANCH

    const output = await verifyProvider(
      {
        provider: 'my-provider-service',
        branch: branch!,
        version: process.env.GIT_SHORT_SHA!,
        providerUrl: 'http://localhost:8000',
        pipelineExecution: process.env.CI === 'true',
        pactUrl: process.env.PACT_URL,
        workInProgressPactsSince: '2022-08-01',
        authentication: {
          username: process.env.PACT_BROKER_USERNAME!,
          password: process.env.PACT_BROKER_PASSWORD!,
        },
      },
      {
        stateHandlers: {
          'data exists': () => {
            // Stub external dependencies, seed test data
            return Promise.resolve()
          },
        },
      }
    )

    expect(output).toBeDefined()
  }, 30000)
})
```

**The `set-env-vars.ts` pattern:**
```typescript
import { execSync } from 'child_process'

if (process.env.CI !== 'true') {
  process.env.CI = 'false'
  process.env.GIT_BRANCH = execSync('git rev-parse --abbrev-ref HEAD').toString().trim()
  process.env.GIT_SHORT_SHA = execSync('git rev-parse --short HEAD').toString().trim()
  process.env.PACT_BROKER_USERNAME = ''
  process.env.PACT_BROKER_PASSWORD = ''
}
```

This ensures pact tests work locally (with empty credentials for read-only access) and in CI (where credentials come from the secrets store). The Vitest pact config references this as a `setupFiles` entry.

**CI pipeline additions:**
```yaml
variables:
  PACT_TESTING: "true"
  PACTICIPANTS: "my-provider-service"

verify_pacts:
  uses: ./.github/workflows/pact-verify.yml
  with:
    pacticipants: "my-provider-service"

can_i_deploy:
  uses: ./.github/workflows/pact-can-i-deploy.yml
  strategy:
    matrix:
      environment: [qa, staging, prod]
```

**Monorepo equivalent:** `tests/pact/provider/` (Service B's verification tests)

## How It All Connects

```
Consumer publishes pact
        │
        ▼
   Pact Broker stores it
        │
        ├── Webhook fires → triggers Provider CI pipeline
        │                         │
        │                         ▼
        │                   Provider verifies pact
        │                   (using shared library)
        │                         │
        │                         ▼
        │                   Results published to Broker
        │
        ▼
   can-i-deploy checks
        │
        ├── Consumer: "can I deploy to qa?" → Broker checks if provider has verified
        └── Provider: "can I deploy to qa?" → Broker checks if all consumer pacts are verified
        │
        ▼
   Deploy + record-deployment
```

## Monorepo Recovery Gap

In multi-repo, recovering from a break-glass hotfix is clean: consumer publishes new pact → `enablePending` absorbs the gap → provider verifies → done. Each repo has its own pipeline, so the consumer can `record-deployment` before the provider even runs.

In a monorepo, consumer and provider share a single pipeline. The pipeline order is:

```
consumer pact test → publish → provider verification → can-i-deploy → record-deployment
```

The problem: provider verification runs **before** `record-deployment`. After a break-glass hotfix (where pact was skipped), the Broker still has the old consumer pact marked as deployed. Provider verification checks `{ deployedOrReleased: true }` and pulls the old pact — which expects a field the provider no longer returns.

The new consumer pact (without the field) was just published in the same pipeline run, but it's not yet recorded as deployed. So verification fails.

### Why not reorder the pipeline?

Moving `record-deployment` before provider verification would fix the recovery case, but it means every normal run records a deployment **before** the provider has verified the contract. That's telling the Broker "this version is live" when it hasn't been tested yet. Other services running `can-i-deploy` would see an unverified pact as the deployed version.

The pipeline order exists for a reason: verify first, record after.

### The real fix: separate stages

A production pipeline separates verification from deployment recording into different stages:

```
build and test stage              deploy stage
──────────────────                ────────────
consumer test → publish → verify  can-i-deploy → deploy → record-deployment
```

Verification is in the build/test stage. `can-i-deploy` and `record-deployment` are in the deploy stage, after the actual deploy. Even if verification fails, the deploy still happens (if `can-i-deploy` passes), and `record-deployment` updates the Broker.

In that structure, recovery after a break-glass hotfix is a single commit — no `continue-on-error`, no second cleanup commit. Verification fails against the old deployed pact (expected), but it doesn't block the deploy stage. `record-deployment` updates the Broker, and the next pipeline run verifies cleanly.

Our monorepo pipeline has everything in one job, so verification failing blocks `record-deployment`. The two-commit recovery with `continue-on-error` is a workaround for this structural limitation.

> **TODO:** Restructure the CI pipeline to match the production pattern — move `can-i-deploy` and `record-deployment` into the deploy stage, separate from verification. See [05-ci-cd-patterns.md](05-ci-cd-patterns.md) for the target structure.

### The current workaround: two-commit recovery

1. **Commit 1:** Consumer removes the assertion + `continue-on-error` on provider verification. Verification fails (expected), but `record-deployment` runs and updates the Broker.
2. **Commit 2:** Remove `continue-on-error`. Verification passes because the Broker now has the new pact as deployed.

See `09-coordinated-breaking-changes.md` → "Proof — The Friday-to-Monday Recovery" for the full exercise.

## Monorepo Simplifications

In this learning project, several things are simpler because everything is in one repo:

| Multi-repo concern | Monorepo simplification |
|---|---|
| Webhook triggers cross-repo pipeline | Not needed — both services share a pipeline |
| Shared library published to private registry | Local helper module imported directly |
| `PACTICIPANT_NAME` set by CI per-service | Can be hardcoded in test config |
| `can-i-deploy` before each environment | Single `local` environment |
| `record-deployment` after each deploy | Single deploy script |
| Separate pact test configs per service | One shared pact config |
| Broker credentials from secrets store | `.env` file with local passwords |
| Initialisation via separate repo + manual trigger | Local script run once |

These simplifications are fine for learning. The patterns, naming conventions, and workflow are identical — only the plumbing differs.

## Scaling Checklist — Moving to Multi-Repo

When you move to a real org, use this checklist to set up each piece:

### Broker Infrastructure
- [ ] IaC repo provisioning container orchestration + managed Postgres
- [ ] Load balancer + DNS record (e.g. `pact-broker.example.io`)
- [ ] Secrets store for credentials (automation + read-only)
- [ ] Security groups restricting access
- [ ] Automated daily database backups
- [ ] Broker image version pinned, upgrade process documented
- [ ] Register environments: `pact-broker create-environment` for dev, qa, staging, prod

### Provider Initialisation
- [ ] Separate repo with shell scripts + CI pipeline
- [ ] Manual-trigger only (no auto-run on push)
- [ ] Input validation (provider name, 8-char SHA, project ID, trigger token)
- [ ] Dry run mode
- [ ] BATS tests for every script
- [ ] Parallel deployment recording across all environments
- [ ] Webhook creation with `--contract_requiring_verification_published`

### Shared Provider Library
- [ ] Separate repo, published to private npm registry
- [ ] Wraps `@pact-foundation/pact` Verifier with org defaults
- [ ] Hardcodes broker URL
- [ ] Sets `enablePending`, `consumerVersionSelectors`, `failIfNoPactsFound`
- [ ] Handles webhook-triggered vs regular build branching
- [ ] `ensurePactIsForProvider` workaround for multi-provider repos
- [ ] Supports both HTTP and message providers
- [ ] Versioned with changesets + semver

### Per Consumer Service
- [ ] Consumer pact tests using `@pact-foundation/pact` (or `jest-pact` wrapper)
- [ ] Separate pact test config (`vitest.pact.config.mts` or `jest.pact.config.js`)
- [ ] `PACTICIPANT_NAME` set by CI, not hardcoded
- [ ] `test:pact` npm script
- [ ] CI jobs: `pact_test` → `pact_publish` → `can_i_deploy`
- [ ] `PACTICIPANTS` and `ENVIRONMENT` on each deploy job
- [ ] `record-deployment` after each successful deploy (main branch only)

### Per Provider Service
- [ ] Install `@myorg/pact-provider` (shared library)
- [ ] Provider verification test with real handler code
- [ ] `set-env-vars.ts` for local development
- [ ] State handlers for consumer-defined provider states
- [ ] Separate pact test config with 30s+ timeout
- [ ] `test:pact:verify` npm script
- [ ] CI jobs: `pact_verify` → `can_i_deploy`
- [ ] `PACTICIPANTS` and `ENVIRONMENT` on each deploy job
- [ ] `record-deployment` after each successful deploy (main branch only)
- [ ] Provider initialised via the initialisation repo before first consumer publishes

### Shared CI Pipeline Templates
- [ ] Reusable jobs: `pact_test`, `pact_publish`, `pact_verify`, `can_i_deploy`, `record_deployment`
- [ ] `PACT_TESTING` flag to enable/disable all pact jobs
- [ ] Environment mapping function (CI account names → broker environment names)
- [ ] `--retry-while-unknown` in `can-i-deploy` for async verification
- [ ] Block non-pact jobs on webhook-triggered pipelines
- [ ] Broker credentials from CI secrets store, never hardcoded

## Further Reading

- [Pact Nirvana — the recommended CI/CD maturity model](https://docs.pact.io/pact_nirvana)
- [Pact Broker Client CLI](https://docs.pact.io/pact_broker/client_cli)
- [Recording Deployments and Releases](https://docs.pact.io/pact_broker/recording_deployments_and_releases)
- [Webhooks](https://docs.pact.io/pact_broker/webhooks)
