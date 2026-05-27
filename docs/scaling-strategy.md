# Scaling Strategy — Platform Quality Toolkit

How to grow from a single quality engineering repo into a cohesive, reusable platform toolkit.

---

## The Ecosystem Today

This project follows a core philosophy: **deploy infrastructure, then verify it matches intent through automated tests.** As the platform grows (more services, more environments, more consumers), the quality tooling must scale with it.

| Domain | Language | Test Framework | Target |
|--------|----------|----------------|--------|
| Microservices + K8s quality engineering | TypeScript | Vitest, Playwright, k6, Pact, BATS | Kubernetes clusters |
| Performance testing | TypeScript | k6 | Any HTTP service |
| IaC deployment validation | Terraform + TypeScript | Vitest or BATS | Cloud resources |

---

## Three Horizons

### Horizon 1: Consolidate Patterns (Now)

Document conventions that all future repos and services follow. This costs nothing — it's a markdown file that future work references.

| Convention | Implementation |
|-----------|---------------|
| Test structure | `tests/<domain>/utils/`, `fixtures/`, `*.test.ts` |
| Config validation | Zod schema, crash on invalid |
| CI gates | Vitest + JUnit output |
| Post-deploy verification | Integration tests against live endpoints |
| Expected-state fixtures | `fixtures/golden-set.json` or `fixtures/expected-state.json` |
| Results output | `results/` directory (gitignored) |
| Documentation | `docs/` with strategy, decisions, runbooks |
| IaC validation | Policy rules against manifests, post-apply assertions |

**Deliverable:** Platform quality playbook (done — `docs/platform-quality-playbook.md`).

---

### Horizon 2: Extract Reusable Tooling (After Phase 11)

Once the TypeScript side is production-hardened, extract pieces that other repos or services can consume as packages or templates.

| Extractable | What it becomes | Who uses it |
|-------------|----------------|-------------|
| `vitest.base.ts` + JUnit + coverage thresholds | `@platform-quality/vitest-config` | Any TypeScript test repo |
| Integration test utilities (config resolution, `waitFor` retry, auth clients, API helpers) | `@platform-quality/integration-utils` | Any service with integration tests |
| k6 modular structure (requests → flows → scenarios) | `@platform-quality/k6-config` or standalone template | Any service needing performance tests |
| Pact CI lifecycle (publish, verify, can-i-deploy, record-deployment) | Shared CI templates + broker infrastructure | Any service with consumer/provider contracts |
| Playwright utilities (page object base, custom test fixtures, MSW integration) | `@platform-quality/e2e-utils` | Any service with browser-based E2E tests |
| Chaos scripts (`scripts/chaos/`) | `@platform-quality/chaos-toolkit` or shared repo | Any K8s-deployed service |
| Manifest validation rules (`scripts/manifest-validation/`) | `@platform-quality/k8s-policy` | Any K8s repo |
| IaC post-deploy test patterns | Shared template or generator | Any Terraform/IaC repo |

#### Integration Test Utilities — What Gets Extracted

Integration tests across services share the same infrastructure problems:

| Utility | What it solves |
|---------|---------------|
| Config resolution | Typed config that resolves from env vars, SSM, or stack outputs — fails fast in CI if values are missing |
| `waitFor` / retry with backoff | Async assertions that poll until a condition is met or timeout — essential for eventually-consistent systems |
| Auth helpers | Token acquisition for protected endpoints (service-to-service, user tokens) |
| API client wrappers | Typed HTTP clients with error normalisation, timeout defaults, request ID propagation |
| Test data helpers | Fixture creation/teardown, unique ID generation, queue/event utilities |

This becomes a package that any integration test suite imports:

```ts
import { createConfig, loadConfig } from '@platform-quality/integration-utils/config'
import { waitFor } from '@platform-quality/integration-utils/wait'
import { createApiClient } from '@platform-quality/integration-utils/http'
```

The pattern is: **test files contain assertions only, infrastructure lives in a shared package.**

#### Playwright Utilities — What Gets Extracted

| Utility | What it solves |
|---------|---------------|
| Page object base class | Common navigation, cookie handling, wait patterns |
| Custom test fixtures | MSW integration, auth state, environment resolution |
| Assertion helpers | Retry-aware assertions for async UI state |
| CI config defaults | `forbidOnly`, `trace`, multi-browser projects, reporter setup |

This becomes a package or shared config that E2E repos extend:

```ts
import { createPlaywrightConfig } from '@platform-quality/e2e-utils/config'
import { BasePageObject } from '@platform-quality/e2e-utils/page-objects'
```

#### k6 Performance Framework — What Gets Extracted

The k6 setup in this repo (`tests/load/src/`) follows a modular architecture that's reusable across any service:

| Layer | Purpose | Example |
|-------|---------|---------|
| `requests/` | Individual HTTP calls — one function per endpoint | `getHealth(config)`, `postClassify(config, text)` |
| `flows/` | Composed sequences of requests — user journeys | `healthChecks(config)`, `dataFlow(config)` |
| `scenarios/` | k6 scenario functions that call flows | `fullJourneyScenario(config)` |
| `config/` | JSON load profiles (smoke, regression, load, stress) | `smoke-test.json`, `load-test.json` |
| `utils/` | Logger, request params, summary handler | `handleSummary()`, `getRequestParams()` |

To scale this for new services:

1. **New service = new request file.** Add `requests/service-d-api.ts` with endpoint functions.
2. **New journey = new flow.** Compose requests into a flow that represents a user journey.
3. **New load profile = new JSON config.** Define VUs, duration, thresholds per environment.
4. **Extraction point:** When 3+ repos need performance tests, extract the `utils/` layer (logger, summary handler, request params, threshold comparison) into a shared package. The requests/flows/scenarios stay service-specific.

What's extractable vs what stays local:

| Extractable (shared) | Stays local (per-service) |
|---------------------|--------------------------|
| `handleSummary()` — HTML/JSON report generation | Request functions (service-specific endpoints) |
| `getRequestParams()` — transaction tagging | Flow compositions (service-specific journeys) |
| Logger utilities | Scenario definitions |
| Threshold comparison / regression detection | Load profile configs (service-specific SLAs) |
| Baseline management scripts | Test data / fixtures |

#### Pact — What Gets Extracted

Pact is the largest extraction candidate. It requires broker infrastructure (hosted or self-hosted), CI workflow templates for the publish → verify → can-i-deploy → record-deployment lifecycle, and onboarding docs for new consumers/providers. The full strategy is documented in `docs/pact/` — particularly [06-repo-separation.md](pact/06-repo-separation.md), [07-adoption-at-scale.md](pact/07-adoption-at-scale.md), and [08-adoption-plan.md](pact/08-adoption-plan.md).

> **Note:** `biome.jsonc` and `tsconfig.base.json` are coding standards concerns, not quality tooling. If extracted, they belong in a `@your-org/coding-standards` package alongside ESLint configs and formatting rules. This repo adopts them as internal standards but doesn't own their distribution.

**Decision gate:** Extract when a pattern has 3+ consumers. Before that, copy-and-adapt is fine.

**Extraction order (by consumer count):**
1. Integration test utilities — every service with integration tests needs config resolution, waitFor, and API helpers
2. Pact CI lifecycle — any service with cross-service dependencies benefits immediately
3. Vitest base config — every TypeScript test repo benefits
4. Playwright utilities — any repo with browser E2E tests
5. k6 shared utilities (summary handler, regression detection, logger) — any service needing performance tests
6. Chaos toolkit — useful once multiple services deploy to K8s
7. Manifest validation — useful once multiple repos have K8s manifests

---

### Horizon 3: Platform Quality as a Product (Future)

The tooling collectively forms a platform quality offering:

```
Platform Quality Toolkit
├── Performance Testing       → k6 modular framework (requests/flows/scenarios)
├── Service Quality           → Microservice quality patterns (Vitest/Pact/MSW)
├── E2E Testing               → Playwright utilities (page objects, route mocking, fixtures)
├── Infrastructure Validation → K8s manifest policy + post-deploy assertions
├── Deployment Validation     → IaC post-apply tests (Terraform + TypeScript)
└── Resilience Testing        → Chaos experiments (shell scripts + assertions)
```

To make this a product (internal or external), four things are needed:

#### 1. Template Generator

```bash
npx @platform-quality/create --type=k6        # scaffolds k6 modular structure
npx @platform-quality/create --type=vitest    # scaffolds test domain with base config
npx @platform-quality/create --type=service   # scaffolds full service (app, config, tests, Dockerfile, K8s manifest)
npx @platform-quality/create --type=e2e       # scaffolds Playwright with page objects + MSW
npx @platform-quality/create --type=infra     # scaffolds IaC validation tests
```

Generates the correct structure, config files, and CI pipeline stubs. New repos start compliant from day one.

#### 2. Shared CI Templates

Reusable workflow definitions that any repo can reference:

```yaml
# TypeScript service repos
include:
  - template: platform-quality/typescript-quality-gates.yml
    # gives you: biome ci, tsc --noEmit, vitest with JUnit, coverage thresholds

# K8s repos
include:
  - template: platform-quality/k8s-deploy-and-test.yml
    # gives you: deploy, integration tests, smoke perf, chaos (main only)

# IaC repos
include:
  - template: platform-quality/iac-validate-and-test.yml
    # gives you: plan, apply, post-deploy assertions, teardown
```

#### 3. Quality Dashboard

Extend the existing dashboard (`docs/dashboard/`) to aggregate results across repos:

- Performance trends per service (k6 results)
- Contract compatibility matrix (Pact broker data)
- Chaos experiment history (recovery times, failure modes)
- Infrastructure compliance status (manifest validation, IaC assertions)

Single page that answers: "Is the platform healthy?"

#### 4. Onboarding Docs

A single guide that answers: "I have a new service/infrastructure, how do I add quality gates?"

- Decision tree: what type of testing do you need?
- 5-minute quickstart per test type
- Links to templates and examples
- "Copy this, change these 3 values, push" instructions

---

## Concrete Next Steps

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 1 | ~~Create platform quality playbook~~ ✅ | Done | High — reference for every new repo |
| 2 | Complete Phase 11 (production hardening) | Medium | High — proves patterns work at production grade |
| 3 | Extract integration test utilities (`config`, `waitFor`, API helpers) into a shared package | Medium | High — every integration test suite needs these |
| 4 | Extract `vitest.base.ts` into a shareable quality config package | Small | Medium — reusable across TypeScript test repos |
| 5 | Extract Playwright utilities (page object base, CI config defaults, MSW patterns) | Small | Medium — reusable across E2E repos |
| 6 | Extract k6 shared utilities (summary handler, regression detection, logger) | Small | Medium — reusable across performance test suites |
| 7 | Build template generator (`@platform-quality/create`) | Large | High — but only after patterns are stable |
| 8 | Extend dashboard to aggregate cross-repo results | Medium | Medium — visibility across the toolkit |
| 9 | Create shared CI workflow templates (GitHub Actions reusable workflows) | Medium | High — any new repo gets quality gates for free |

---

## When to Extract vs. When to Copy

| Signal | Action |
|--------|--------|
| 3+ repos use the same pattern | Extract into a package or template |
| Pattern is still evolving (< 3 months old) | Copy and adapt — extraction locks you in too early |
| Change in one repo should propagate to all | Extract — single source of truth |
| Each repo needs different behaviour | Keep separate — shared config with overrides |
| You're spending time keeping copies in sync | Extract — the maintenance cost has exceeded the extraction cost |

---

## What's Already Proven

- **k6 modular architecture works** — requests/flows/scenarios separation is clean and extensible
- **TypeScript test conventions are documented** — playbook covers structure, config, standards
- **Dashboard pattern exists** — artifact-as-database, GitHub Pages, trend charts
- **Manifest validation is generic** — policy rules work against any K8s YAML, not service-specific
- **Chaos scripts are service-agnostic** — pass a service name, get resilience data back
- **MSW mocking pattern established** — same handlers serve component tests, E2E, and dev mode
- **Integration test structure is consistent** — `utils/`, `fixtures/`, `results/`, assertions-only test files

The pieces exist. The scaling path is: document → harden → extract → productise.
