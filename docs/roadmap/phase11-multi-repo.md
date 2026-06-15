# Phase 11: Monorepo Cleanup Toward Multi-Repo

## Purpose

This project is already a monorepo. Phase 11 is not about turning it into one.

The goal is to make the existing monorepo cleaner and more intentionally shaped so it can later be split into service repos, shared tooling repos, and infrastructure repos without a large, risky refactor.

Today, the repo works well as a learning lab:

```text
services/
tests/
scripts/
docs/
k8s/
```

That structure is fine for proving the quality engineering workflows. The next step is to make the boundaries clearer:

```text
services/              # reference apps: Service A, Service B, Service C, UI
packages/              # reusable tooling libraries
scripts/               # thin wrappers and repo-level commands
docs/                  # architecture, adoption guides, roadmap
k8s/                   # local demo infrastructure
tests/                 # cross-service and reference test suites
```

This keeps the repo useful now while preparing it for a future split.

## Recommended Phase 11 Shape

Phase 11 should move the repo toward this shape:

```text
platform-quality-lab/
├── packages/
│   ├── platform-quality-utils/
│   ├── pact-provider/
│   └── ci-quality-scripts/
├── services/
│   ├── service-a/
│   ├── service-b/
│   ├── service-c/
│   └── ui/
├── tests/
├── scripts/
├── docs/
└── k8s/
```

The important part is not the exact folder names. The important part is that reusable quality tooling stops being mixed together with app-specific service code.

## What Stays Where For Now

### `services/`

Keep `service-a`, `service-b`, `service-c`, and `ui` in this repo for Phase 11.

They are the reference system that proves the quality tooling works:

```text
UI -> Service A -> Service B
              \-> Service C -> LLM
```

Splitting them too early would add repo and CI overhead before the package boundaries are stable.

### `packages/platform-quality-utils/`

This should contain generic, reusable quality utilities that are not tied to one service.

Good candidates:

- Kubernetes manifest validation helpers
- trend extraction and report parsing helpers
- notification formatting helpers
- chaos or LLMOps report helpers that are not service-specific

This package should not become a dumping ground for everything. If code is specific to Pact, CI orchestration, a service, or the UI, it probably belongs somewhere else.

### `packages/pact-provider/`

Pact should stay separate from generic utilities.

This package should eventually wrap `@pact-foundation/pact` provider verification with organisation defaults:

- broker URL handling
- pending and WIP pact defaults
- consumer version selectors
- webhook-triggered verification
- provider-name checks for multi-provider repos
- common verifier configuration

This maps to a future internal package such as `@org/pact-provider`.

### `packages/ci-quality-scripts/`

This is the future home for reusable CI helpers.

Good candidates:

- `can-i-deploy` wrappers
- deployment recording helpers
- branch and environment mapping
- pact publishing helpers
- quality gate helpers used by multiple services

For now, existing shell scripts can stay under `scripts/` until they are ready to be packaged or templated.

### `k8s/`

Keep local Kind and demo infrastructure here for now.

The Pact Broker manifests are useful in this repo because they make the lab self-contained. In a real organisation, this would move to a dedicated infrastructure repo.

## Future Split Target

Once the boundaries are clear, the repo can be split into:

```text
service-a repo
service-b repo
service-c repo
ui repo
platform-quality-lab repo
infra-pact-broker repo
```

The future responsibilities would be:

| Future repo | Responsibility |
| --- | --- |
| `service-a` | Service A app code, service-specific tests, consumer pacts for B/C, provider pact verification for UI |
| `service-b` | Service B app code, provider pact verification, service-specific tests |
| `service-c` | Service C app code, LLM integration, provider pact verification, LLMOps tests that are service-specific |
| `ui` | React app, API client, UI consumer pact against Service A, Playwright/component tests |
| `platform-quality-lab` | shared packages, docs, reusable quality scripts, reference examples |
| `infra-pact-broker` | Pact Broker infrastructure, database, credentials, environments, upgrades |

## Pact Split Guidance

Pact should not be treated as one generic util.

In a real split, Pact has several different homes:

| Current location | Future home |
| --- | --- |
| `k8s/pact-broker.yaml` and broker database manifests | `infra-pact-broker` |
| provider verifier helper code | `packages/pact-provider` |
| `scripts/pact/can-i-deploy.sh` | shared CI templates or `packages/ci-quality-scripts` |
| `scripts/pact/publish.sh` | shared CI templates or `packages/ci-quality-scripts` |
| consumer pact specs | the consumer service repo |
| provider verification specs and state handlers | the provider service repo |
| Pact docs | shared docs or platform-quality documentation |

This keeps the architecture close to how Pact works in a real organisation: service teams own their contracts, platform owns shared tooling, and infrastructure owns the Broker.

## Recommended Implementation Order

### 11a: Map and document

Create this document and use it as the reference for future Phase 11 work.

Done when:

- the current monorepo shape is documented
- the recommended Phase 11 shape is documented
- the future multi-repo target is documented
- Pact ownership is separated from generic utilities

### 11b: Create monorepo packages

Add `packages/` and start with the lowest-risk shared package.

Recommended first package:

```text
packages/platform-quality-utils/
```

Move one narrow utility area first, such as manifest validation or notification formatting. Avoid moving all scripts at once.

Done when:

- the package has its own `package.json`
- the package exports one small, useful utility area
- existing scripts can import from it
- tests still pass

### 11c: Add agent/project guidance

Add root guidance such as `AGENTS.md` so future sessions understand the repo shape quickly.

Done when:

- service responsibilities are described
- package responsibilities are described
- common commands are listed
- Pact boundaries are explained

### 11d: Actual repo split

Do this only after the package boundaries are stable.

This is high-cost work because each split repo needs:

- package setup
- CI setup
- deployment setup
- secrets
- Pact publishing or verification jobs
- local development instructions
- ownership of service-specific tests

This should be saved until the lab is stable or the goal is specifically to practise a real multi-repo migration.

## Decision

For Phase 11, keep this repository as the main lab, but clean the internal boundaries.

Do not rip out Service A, Service B, Service C, or the UI yet. Keep them as reference apps while extracting shared quality tooling into packages.

Treat the repo as a staging ground for the future multi-repo architecture, not as the final production layout.

MR 1: Add Phase 11 multi-repo plan - DONE
MR 2: Add packages/platform-quality-utils skeleton - DONE
MR 3: Extract manifest validation utilities into platform-quality-utils
MR 4: Extract notification/report formatting helpers into platform-quality-utils
MR 5: Add AGENTS.md repo guidance
MR 6: Spike/design only: packages/pact-provider boundary