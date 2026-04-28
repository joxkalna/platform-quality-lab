# Platform Quality Lab — Project Rules

## Project Purpose
This is a learning project for SDET/platform quality engineering skills, mapped to an AI infrastructure-style role. The goal is to build a microservices system, deploy it on Kubernetes, break it intentionally, and encode learnings into CI guardrails.

## Project Mindset
Treat this project as if it's a real service running in a large organisation. Use production-grade tooling, patterns, and practices — even if the services themselves are simple. The services are intentionally trivial because the focus is on the platform, pipeline, and quality engineering around them — not the business logic. Never dismiss a tool or pattern as "overkill" — if it's used in real orgs, it belongs here.

## Hard Rules — Non-Negotiable
These rules exist because they were violated during development and caused real damage. They are not guidelines — they are absolute.

1. **Never run `record-deployment`, `publish`, or `can-i-deploy` from the terminal.** These are CI-only operations. The pipeline is the single source of truth for what's deployed. Running them locally pollutes the Broker with untraceable versions and breaks `can-i-deploy` for every service. The only local Pact commands allowed are `npm run test:pact` (consumer tests) and `npm run test:pact:verify` (provider verification).

2. **Never record deployments from feature branches.** `record-deployment` only runs on the protected main branch, after a real deployment. A feature branch pact is a proposal, not a deployment. Recording it as deployed pollutes the Broker's `deployedOrReleased` selectors and causes provider verification failures when the branch is reverted.

3. **Never modify scripts that are designed to be reusable across projects based on a single project's quirks.** `initialise-provider.sh` follows the standard provider initialisation pattern. If it fails on PactFlow but works on a self-hosted broker, the fix belongs in PactFlow-specific documentation — not in the script itself.

4. **The pipeline owns the Pact lifecycle.** Pact state (versions, deployments, verification results) must only be created by CI. Manual Broker operations (environment registration, provider initialisation) are one-time setup steps documented in `scripts/` — everything else flows through the pipeline.

### What went wrong (learning log)
- `learning-break-pact` branch ran `record-deployment` from a feature branch, polluting PactFlow with experimental pacts as "deployed"
- When the branch was reverted, provider verification still pulled the old deployed pact via `deployedOrReleased` selector and failed
- Fix required `[skip pact]` to merge, then `if: false` to disable pact entirely
- Broker state had to be cleaned up before pact could be re-enabled
- During recovery, `record-deployment` was run from the terminal to create a baseline — this was wrong in principle (pipeline should own it) but was needed as a one-time bootstrap to unblock the first CI run
- `initialise-provider.sh` was incorrectly modified to work around a PactFlow-specific API difference — reverted because the script is meant to be reusable

## Tech Stack
- Language: TypeScript / Node.js (Express)
- Container: Docker (multi-stage builds, non-root user)
- Orchestration: Kind (Kubernetes in Docker) for local clusters
- CI: GitHub Actions

## Architecture
- **Service A** (port 3000): Receives requests, calls Service B at `/info` via `SERVICE_B_URL` env var
- **Service B** (port 3001): Returns data, simulates a downstream dependency
- Both have `/health` endpoints for K8s probes
- K8s manifests live in `k8s/` with readiness/liveness probes and resource limits

## Phased Plan
- **Phase 1** ✅ Scaffold — monorepo, both services, Dockerfiles, K8s manifests, Kind config
- **Phase 2** ✅ Local cluster + deploy — Kind cluster, metrics-server, build/load images, deploy, verify service-to-service comms
- **Phase 3** ✅ CI pipeline — GitHub Actions (lint, config validation, contract checks, integration tests)
- **Phase 4** ✅ Failure injection — pod kills, resource pressure, dependency failure, latency injection
- **Phase 5** ✅ Guardrails — CI gates, chaos reporting with diagnostics, manifest validation, contract testing, code quality
  - ✅ Contract testing (Pact) — consumer/provider tests, PactFlow Broker, can-i-deploy gate in CI
  - ✅ Manifest validation — CI gate that parses K8s YAML and asserts replicas, limits, probes
  - ✅ Chaos reporting — structured JSON reports with diagnostics from chaos scripts
  - ✅ Chaos CI gates — all chaos experiments run in CI, fail pipeline if services don't survive
  - ✅ Code quality gates — custom ESLint rules for fetch timeouts and error handling
- **Phase 6** AI service — add a new service wrapping an LLM API, deploy to Kind, wire into service mesh, load test with k6
- **Phase 7** LLMOps — non-deterministic assertion patterns, golden set benchmarks, accuracy thresholds as CI gates, consistency tests, evaluation pipelines
- **Phase 8** API collections (Bruno) — version-controlled API collections for exploratory testing, environment management, CI smoke tests via `bru run`
- **Phase 9** UI + frontend quality — React UI for Service C's classify endpoint, frontend Pact consumer, Lighthouse CI gates, k6 browser testing, Playwright E2E

## Phase 6 Load Testing with k6
Full plan, architecture, MR breakdown, and decisions documented in `docs/performance/k6-load-testing.md`.

k6 is deferred to Phase 6 because Services A and B are HTTP pass-throughs with minimal resource usage. Service C (AI) has real processing that makes load testing valuable: performance baselines, breaking point discovery, regression detection, chaos + load combined.

**Scope:** k6 load tests Services A and B — HTTP throughput, latency under concurrency, infrastructure isolation (is the bottleneck in the service, the DNS, or the networking?). Service C is excluded from load profiles — LLM on constrained Kind resources means chaos experiments already cover its failure behaviour. Service C load testing deferred to when there's a real LLM backend worth profiling.

**MR breakdown:**
- MR 1 ✅ — Framework scaffold + smoke test (native k6 TypeScript, 3-layer architecture, CI smoke)
- MR 2 — Load + stress profiles + regression analysis (10% threshold, GitHub artifacts, baselines)
- MR 3 — Slack notifications + monitoring (personal Slack workspace, webhook alerts on regression)

**Key decisions:**
- Native k6 TypeScript over webpack + babel — k6 v1.x runs `.ts` files directly, no build step needed. Requires `.ts` extensions on all local imports and `allowImportingTsExtensions: true` in tsconfig
- Functional programming style throughout — arrow functions, no classes. Matches k6's own API (`check()`, `group()`, `http.get()`). Logger, request params, handleSummary are all plain exported functions
- 3-layer architecture: requests → flows → scenarios. Requests are atomic HTTP calls with `check()` assertions and transaction tags. Flows compose requests into reusable groups with `group()` for aggregated metrics. Scenarios compose flows into user journeys
- Three scenario types: `healthCheck` (isolated baseline), `dataFlow` (isolated A → B hop), `fullJourney` (chained realistic journey). Isolated scenarios for baselines, chained for realistic traffic patterns
- External JSON load profiles — swap profiles without changing test code
- `tests/load/` has its own `package.json` — only `@types/k6` for IDE autocomplete
- Smoke test on every push, load test on every push (feature branches compare against main's artifact), stress test on-demand
- Branch-vs-main comparison — adapted from production compute test pattern (run same profile, compare artifacts) instead of relying solely on committed baselines
- 10% regression threshold (industry standard for performance gates)
- Personal Slack workspace with Incoming Webhooks for CI alerts
- GitHub Actions artifacts + committed baselines for tracking (cloud dashboards deferred to post Phase 7)
- Service C excluded from load profiles — chaos experiments cover LLM failure behaviour, load testing deferred to real backend
- k6 runs on CI host with port-forwarding to Kind cluster (same approach as integration tests)
- Reusable utilities: logger, request params helper, transaction tagging, handleSummary (JSON + text output)

**MR1 smoke baseline (CI — Kind cluster):**
- `checks`: 100%
- `http_req_failed`: 0%
- `http_req_duration` p95: ~15ms
- `http_req_waiting` p95: ~14.7ms
- `group_duration` p95: ~26ms

These are smoke baselines from the first CI run. Load baselines (MR2) will be established under sustained traffic.

**Performance documentation:**
- `docs/performance/perf-min.md` — when performance testing is required, decision checklist
- `docs/performance/perf-baseline.md` — per-endpoint thresholds, regression criteria, baseline load definition
- `docs/performance/k6-load-testing.md` — full implementation plan, architecture, MR breakdown, production patterns

## Phase 6 Pact Evolution
Adding Service C creates a new service boundary and an opportunity to exercise real-world Pact scenarios that don't come up when you only have two services.

**New contracts:**
- Service A (consumer) → Service C (provider) — new pact for `/classify`
- Service A (consumer) → Service B (provider) — unchanged

**Exercises completed:**

| Exercise | Branch | What happened | What it taught |
|---|---|---|---|
| Add new provider | `phase6/ai-service-part2` | Initialised Service C on PactFlow, consumer wrote first pact, provider verified | Full provider onboarding workflow (second time — reinforced the process) |
| Breaking change (change type) | `learning-break-pact` | Changed `confidence` from number to string, observed Pact catch the type mismatch | Pact catches breaking changes before production. Also exposed monorepo limitation: coordinated changes in one commit still fail because provider verifies against *deployed* pact |
| Expand and Contract (4 MRs) | `phase6/pact3` | Used a `priority` field to exercise the full production-safe pattern — see MR details below | Additive changes are safe, consumer-driven contracts work, safe removal requires no consumer dependency |
| Friday-to-Monday recovery (`severity`) | `phase6/pact3` | Simulated a real hotfix: added `severity`, skipped pact to deploy removal, recovered Monday by updating consumer and re-enabling pact | `PACT_ENABLED` variable is reliable for break-glass, recovery is a single consumer MR, Broker self-heals when new pact is published |

**Exercises remaining:**

| Scenario | What happens | What it teaches |
|---|---|---|
| Deprecate an endpoint | Service B wants to remove `/info` | can-i-deploy blocks it because Service A still depends on it |

**Monorepo vs reality:**
All three services stay in one repo for Phase 6. This simplifies CI (one pipeline, one commit SHA for all services) but doesn't reflect production where each service would be its own repo with its own pipeline. The Pact patterns (consumer tests, provider verification, can-i-deploy, record-deployment) are identical in both setups — only the trigger changes. In a monorepo, verification runs in the same pipeline. In multi-repo, a webhook triggers the provider's pipeline when a consumer publishes a new pact. The `can-i-deploy.sh` script uses `--to-environment` per service per environment — the same query a multi-repo pipeline would make. See `docs/pact/06-repo-separation.md` for the full mapping.

## Phase 6 Pipeline Integration Tests
When Service C (AI) is added, it introduces a real processing pipeline: prompt construction → LLM call → response parsing → confidence scoring. This is the first service with transformation logic worth testing end-to-end, not just at the HTTP layer.

**Pattern:** Spin up real infrastructure in a container, send real input through it, assert on what comes out the other side. This is how production observability pipelines are tested — a test harness starts the real service, sends data in, and a mock exporter on the output side captures what was produced.

**Shape:**
```
configure test harness → start real service in container → send input → assert on output → teardown
```

**Why this doesn't apply to Services A and B:** They're HTTP pass-throughs with no transformation. Data goes in and comes out unchanged. There's nothing in the middle to test beyond "did the HTTP call work?" — which the current integration tests already cover.

**Why it applies to Service C:** The AI service will process input (build prompts, parse responses, score confidence, maybe cache). Bugs hide in that processing layer. An HTTP status 200 with the right shape doesn't mean the prompt was constructed correctly or the confidence score was calculated right.

**What this means concretely:**
- Current integration tests (axios + HTTP assertions) stay for Services A and B
- Service C gets an additional test layer: start the service in a container, send known inputs, assert the full output (not just status + shape, but content correctness)
- This is where golden set assertions (Phase 7 LLMOps) plug in — the test harness sends golden set inputs and asserts on accuracy
- Config validation with Zod for Service C — LLM endpoint, timeout, model parameters, temperature all need validation (bare `process.env` isn't enough when misconfiguration means wrong answers, not just errors)

**Observability as a test layer:**
Services A and B have no instrumentation — we assert on HTTP responses and kubectl output. Service C should add OpenTelemetry (traces, metrics) so that tests can assert on what happened *inside* the pipeline, not just what came out the end:
- Did the LLM call span have the right duration? (latency regression)
- Did the prompt construction step emit the expected attributes? (transformation correctness)
- Did the confidence score metric fall within expected range? (output quality)

This is how production observability pipelines are tested — a test harness sends data through real infrastructure and asserts on the telemetry it produces, not just the HTTP response. The HTTP response tells you *what* happened. The telemetry tells you *how* it happened.

**The timeout observability gap:**
When a service times out or crashes, the OTEL SDK may not get a chance to flush its spans — the process is killed mid-flight and the telemetry for that invocation is lost. Dashboards show nothing, but the failure happened. This is a real production problem: timeouts pile up silently, queues fill, and nobody knows until someone digs through raw logs. Service C should explore this gap — if the LLM call times out, does the trace still get exported? If not, how do you detect it? The answer involves either flush-before-timeout patterns or a fallback telemetry path (e.g. log-based fallback → forwarder → collector).

**Other approaches for testing the processing layer:**

| Approach | What it tests | When to use |
|---|---|---|
| HTTP assertions (what we have now) | Status codes, response shape | Always — baseline for every service |
| Pipeline integration tests (harness pattern) | Full input → output correctness through real infrastructure | Services with transformation logic (Service C) |
| OpenTelemetry trace assertions | Internal processing steps, latency per stage, attribute correctness | When you need to know *how* the service processed the request, not just the result |
| Snapshot/regression tests | Output stability across code changes | When prompt or model changes could silently degrade quality |
| Contract tests (Pact) | API shape agreement between services | Always — for every service-to-service boundary |

## Phase 6 Current Progress
Branch: `phase6/ai-service-part2`

**Done:**
- Service C scaffolded (Express + Zod config + Ollama LLM client)
  - `services/service-c/` — src/app.ts, src/server.ts, src/config.ts, src/llm.ts, src/types.ts, Dockerfile, package.json, tsconfig.json
  - `k8s/service-c.yaml` — 2 replicas, resource limits, separate readiness (checks LLM) / liveness (/health)
  - Endpoints: `POST /classify` (text → category + confidence), `GET /health`, `GET /ready`
  - Zod validates all config at startup (LLM_ENDPOINT, model, temperature, timeout)
  - Exports `app` for Pact provider verification
- All services refactored to app.ts + server.ts pattern (pure app, no side effects on import)
- Service A wired to call Service C (`POST /classify` via `SERVICE_C_URL` env var)
- Pact consumer test for Service A → Service C
- Pact provider verification for Service C with stubs (StubbedIntegrations pattern)
  - Fixtures: mock Ollama LLM responses
  - Stubs: fetch interceptor for Ollama API calls
  - State handlers: set up stubs before Pact replays requests
- CI pipeline updated: build, load, deploy Service C with Ollama on host
- Ollama runs on CI host (not in Kind — avoids disk space issues with kind load)
- deploy-local.sh updated for Service C + Ollama
- can-i-deploy.sh updated for 3 services
- Dependabot config updated for Service C
- Break-glass procedure documented (docs/pact/break-glass.md)
- Pact breaking change exercise completed — deliberately broke confidence type, observed Pact catch it
- Dependencies updated across all services (Express 5, TypeScript 6, @types/node 25)
- Chaos summary renderer rewritten in TypeScript
- README cleaned up as a landing page
- ESLint resilience rules improved (understands utility functions that throw)
- Provider verification docs expanded (stubbing patterns, multi-provider, scaling)

**On learning-break-pact branch (not merged — demonstration only):**
- Deliberately changed confidence from number to string
- Observed Pact catch the breaking change (provider verification failed against deployed pact)
- Tested [skip pact] commit message flag
- Tested continue-on-error on provider verification
- Branch exists as proof of the learning exercise
- **Unresolved:** In a monorepo, a coordinated breaking change (both consumer and provider update in one commit) still fails provider verification because it checks against the *deployed* pact, not the branch pact. `continue-on-error` and `[skip pact]` are workarounds, not solutions. The proper fix for monorepo breaking changes is still an open question — need to investigate whether Pact's `consumerVersionSelectors` can be configured to only verify against the current branch during breaking changes, or whether this is a fundamental limitation of Pact in monorepos.

**Expand and Contract exercise (4 MRs on `phase6/pact3` branch):**

Exercising the production Expand and Contract pattern from `09-coordinated-breaking-changes.md` using a `priority` field (P1–P4 mapped from category). Each MR is independently reviewable, rollback-safe, and exercises the real Pact lifecycle. No `[skip pact]`, no `continue-on-error`, no break-glass.

| MR | Status | Name | What changes | Pact state after merge |
|---|---|---|---|---|
| 1 | ✅ | Expand — provider adds `priority` | Service C returns `priority` in `/classify` response. Consumer pact unchanged — does not assert on `priority` yet. Also: re-enabled pact job, registered `qa` environment, rewrote `can-i-deploy.sh` for 3-environment flow | Provider returns extra field, consumer ignores it — backwards compatible |
| 2 | ✅ | Migrate — consumer starts using `priority` | Consumer pact test adds `priority: MatchersV3.string(...)` assertion. Provider already returns it → verification passes | Both sides agree on `priority` — consumer depends on it |
| 3 | ✅ | Contract — consumer stops asserting `priority` | Consumer pact test removes `priority` assertion. Provider still returns it — extra fields ignored | Consumer no longer depends on `priority` — safe to remove from provider |
| 4 | ✅ | Cleanup — provider removes `priority` | Service C removes `priority` from response. `can-i-deploy` confirms no consumer depends on it | Code back to starting state, Broker state clean, full lifecycle exercised |

**Friday-to-Monday recovery exercise (`severity` field):**

| Step | What happened | Pipeline result |
|---|---|---|
| Setup | Provider added `severity` (SEV1–SEV4) + consumer added assertion — both merged to main | ✅ Both sides depend on `severity` |
| Friday hotfix | Provider removed `severity`, `PACT_ENABLED=false` in repo variables | ✅ Pact skipped, hotfix deployed |
| Monday recovery (commit 1) | Consumer removed `severity` assertion, `PACT_ENABLED=true`, `continue-on-error` on provider verification | ✅ Provider verification fails against old deployed pact (expected), `record-deployment` updates Broker |
| Monday recovery (commit 2) | Removed `continue-on-error` | ✅ Provider verification passes, pipeline fully clean |

**Pipeline structure:** The pipeline was restructured so verification (pact job) and deployment recording (deploy-and-test job) are in separate stages. Verification failure no longer blocks `record-deployment`. Recovery after break-glass is now a single commit — no `continue-on-error` needed. The `continue-on-error` two-commit approach remains documented as a valid alternative for pipelines that can't separate stages.

**CI improvement discovered:** `[skip pact]` in commit messages doesn't work on PR merges — `github.event.head_commit.message` only sees the merge commit. Replaced with `PACT_ENABLED` repository variable (`vars.PACT_ENABLED != 'false'`).

After exercises:
- k6 load testing framework (in progress — see `docs/k6-load-testing.md` for full plan)
  - MR 1: Framework scaffold + smoke test
  - MR 2: Load + stress profiles + regression analysis
  - MR 3: Slack notifications + monitoring
- Integration tests for Service C (deferred to Phase 7 LLMOps golden sets — Pact covers API shape)

## Future Improvements
Patterns to adopt after all phases are complete, to bring the services closer to production-grade:

### App factory pattern
Currently, `app.ts` reads env vars at module level. The production pattern is a factory function that receives config as a parameter:

```typescript
// app.ts — receives config, no env var access
export const createApp = (config: { serviceBUrl: string; serviceCUrl: string }) => {
  const app = express()
  // uses config.serviceBUrl, not process.env
  return app
}

// server.ts — validates env vars, creates app
const config = loadConfig()  // Zod validation
const app = createApp(config)
app.listen(config.port)

// test — passes test config directly, no env vars needed
const app = createApp({ serviceBUrl: mockServer.url, serviceCUrl: mockServer.url })
```

Benefits:
- Tests don't need env vars — pass config directly
- No side effects on import — safe to import from any context
- Config is explicit — no hidden dependency on `process.env`
- Same pattern used in Express testing guides and popular Node.js frameworks

Apply this when refactoring after Phase 7 (LLMOps) — it touches every service and every test that imports `app.ts`.

### Zod config for all services
Service C uses Zod for config validation. Services A and B use bare `process.env`. Align all services to the Zod pattern so misconfiguration crashes at startup with a clear error, not silently at runtime.

## Coding Style
- Clean, production-style code — use real tools and patterns as large orgs would
- Keep services simple Express apps — the services are simple on purpose, the infrastructure around them is not
- K8s manifests should always include: resource limits, readiness probes, liveness probes
- Dockerfiles: multi-stage, alpine base, non-root user
- No privileged containers

## Dev Commands
- `npm run dev` — starts both services + opens browser to test
- `npm run stop` — kills both services
- `./scripts/deploy-local.sh` — full local Kind deploy (create cluster, build, load, deploy, verify)
- `kind delete cluster --name platform-lab` — tear down local cluster

## Chaos / Failure Injection Commands
Prerequisites: Docker running + Kind cluster deployed (`./scripts/deploy-local.sh`)
- `./scripts/chaos/pod-kill.sh <service>` — kill a pod, verify service stays up and K8s self-heals
- `./scripts/chaos/resource-pressure.sh <service> <cpu|mem|all>` — inject CPU/memory stress via sidecar, observe throttling and OOMKills
- `./scripts/chaos/dependency-failure.sh [upstream] [downstream]` — kill downstream, verify upstream degrades gracefully
- `./scripts/chaos/latency-injection.sh` — inject latency into downstream, verify upstream timeout behaviour

## Key Decisions
- 2 replicas per service in K8s — enables testing rolling restarts and availability
- Resource limits intentionally tight (50m/64Mi req, 200m/128Mi limit) — to trigger pressure in Phase 4
- Service A has separate liveness (`/health`) and readiness (`/ready`) probes — readiness checks Service B dependency with 2s timeout
- Service B uses `/health` for both probes — it has no downstream dependencies
- All outbound HTTP calls must have timeouts — learned from Phase 4 Step 3 (fetch without timeout hangs instead of failing)
- Service B URL injected via env var in K8s manifest, resolved via K8s DNS
- `imagePullPolicy: Never` in manifests — Kind uses pre-loaded images, not a registry
- metrics-server installed with `--kubelet-insecure-tls` flag (required for Kind, no real TLS between nodes)
- Deploy order: Service B first, then A — A depends on B for `/data` endpoint
- VPN blocks GitHub downloads and image pulls inside Kind nodes — workaround: bundle manifests locally (`k8s/vendor/`), `docker pull` on host then `kind load` into cluster
- metrics-server manifest bundled at `k8s/vendor/metrics-server.yaml` with `--kubelet-insecure-tls` baked in — no network dependency at deploy time
- `--kubelet-insecure-tls` is safe in Kind — it only skips TLS between fake nodes inside Docker's internal network, never touches the real network. Required because Kind nodes don't have real TLS certs
- `imagePullPolicy: Never` is safe in Kind — images are pre-loaded via `kind load`, no registry involved. In a real cloud cluster you'd use a container registry instead

## Phase 4 Chaos Experiments
All chaos scripts live in `scripts/chaos/`. They require a running Kind cluster with services deployed.
- **Pod Kill** (`pod-kill.sh`) — deletes a pod, asserts service stays reachable via surviving replica, waits for K8s to restore full replica count
- **Resource Pressure** (`resource-pressure.sh`) — injects a stress-ng sidecar into the pod (no production code changes), tests CPU throttling and OOMKill behaviour
- **Dependency Failure** (`dependency-failure.sh`) — scales downstream to 0, asserts upstream degrades gracefully (502 not hang), readiness removes it from load balancer, recovery is automatic
- **Latency Injection** (`latency-injection.sh`) — deploys a slow server, points upstream at it, verifies timeout behaviour (under/over threshold)

See [CHAOS.md](CHAOS.md) for full experiment log, learnings, and Phase 5 guardrail implications.

## Pact Contract Testing

### Architecture
- **Service A** is the consumer — calls Service B's `/info` endpoint
- **Service B** is the provider — serves `/info`, verified against consumer pacts
- **Service C** is the provider — serves `/classify`, verified against consumer pacts
- **PactFlow** is the persistent Broker — stores pacts, verification results, deployment history
- Consumer tests generate pact files locally, publish to PactFlow in CI only
- Provider verification runs against PactFlow, publishes results in CI
- `can-i-deploy` and `record-deployment` are embedded inside each deploy stage, not standalone jobs
- `record-deployment` only runs on the protected main branch — never from feature branches
- Feature branches: test + publish + verify only — no can-i-deploy, no record-deployment

### Broker
- PactFlow (SaaS) for persistent history across pipeline runs (30-day free trial, paid after)
- After trial: switch to self-hosted (Docker Compose, K8s, or any cloud with Postgres) — same scripts, change URL + auth method (token → username/password)
- Alternatives: Docker Compose (self-hosted), K8s manifests (reference in `k8s/`), any cloud with Postgres
- Credentials stored in `.env` locally, GitHub Secrets in CI (`PACT_BROKER_BASE_URL`, `PACT_BROKER_TOKEN`)
- Token auth (PactFlow) — not username/password

### Environments
- `dev` — first deploy target on main (mirrors a dev/staging environment)
- `qa` — second deploy target on main (mirrors a QA environment)
- `prod` — final deploy target on main (mirrors production)
- Feature branches do NOT record deployments to any environment
- Registered on PactFlow via `./scripts/deploy-pact-broker.sh` (one-time)

### Commands
- `npm run test:pact` — run consumer tests locally (generates pact files, does NOT publish)
- `npm run test:pact:verify` — run provider verification locally (verifies against PactFlow)
- `./scripts/deploy-pact-broker.sh` — register environments on PactFlow (one-time)
- `./scripts/pact/initialise-provider.sh <name>` — register a provider on PactFlow (one-time per provider)
- `./scripts/pact/publish.sh` — CI only: publish pacts to PactFlow
- `./scripts/pact/can-i-deploy.sh` — CI only: check compatibility + record deployment

### Key Decisions
- PactFlow over self-hosted — persistent history, zero infrastructure, `can-i-deploy` works across pipeline runs
- Token auth — PactFlow uses API tokens, not username/password
- Publish only in CI — `publish.sh` blocks locally to prevent dirty/untraceable versions
- Never publish pacts, record deployments, or run can-i-deploy locally — only `initialise-provider.sh` and `deploy-pact-broker.sh` run locally as one-time setup. Everything else goes through the pipeline. See "Hard Rules" at the top of this file
- `failIfNoPactsFound: false` — provider pipeline passes before any consumer publishes (avoids chicken-and-egg)
- `enablePending: true` — new pacts don't break the provider until verified
- Monorepo `can-i-deploy` uses `--to-environment` per service per environment — same query as multi-repo
- Future improvement: split consumer and provider into separate repos to mirror production multi-repo Pact workflow (see `06-repo-separation.md`)
- Webhooks not needed in monorepo — add when splitting repos (webhook triggers provider verification when consumer publishes a new pact)
- Service B exports `app` with guarded `listen()` — allows `http.createServer(app)` in verification test (matches production thin-server pattern)
- Separate vitest configs for consumer (`vitest.pact-consumer.config.mts`) and provider (`vitest.pact.config.mts`) — 30s timeout, no coverage

### Pact Documentation
Full documentation in `docs/pact/`:
- `00-big-picture.md` — how all pieces fit together
- `01-consumer-guide.md` — writing consumer pact tests
- `02-provider-verification.md` — provider verification patterns
- `03-provider-initialisation.md` — one-time provider setup
- `04-broker-ops.md` — Broker operations, CLI installation, credentials
- `05-ci-cd-patterns.md` — CI/CD pipeline patterns
- `06-repo-separation.md` — monorepo vs multi-repo mapping
- `07-adoption-at-scale.md` — strategies for large org adoption
- `08-adoption-plan.md` — step-by-step plan from zero to working Pact

## Phase 5 Plan
Phase 5 takes the learnings from Phase 4 chaos experiments and encodes them as automated CI guardrails.
Phase 5 is large — split into feature branches:
- `phase5/contract-testing` ✅ — Pact consumer-driven contract tests between Service A and B, PactFlow Broker, can-i-deploy CI gate
- `phase5/manifest-validation` ✅ — CI gate that parses K8s YAML and asserts: replicas ≥ 2, resource limits set, readiness ≠ liveness for services with dependencies
- `phase5/chaos-reporting` ✅ — structured reports from chaos scripts with diagnostics that point at specific code/config when failures occur
- `phase5/chaos-ci-gates` ✅ — run chaos scripts after deploy in CI, fail the pipeline if services don't survive
- `phase5/code-quality-gates` ✅ — custom ESLint plugin for outbound HTTP timeouts, error handling patterns
- `phase5/notifications-dashboard` — (optional) Slack/webhook alerts on guardrail failures + visibility dashboard

### Phase 5 Order
1. ✅ Contract testing (Pact)
2. ✅ Manifest validation
3. ✅ Chaos reporting — structured JSON output with diagnostics, crash-safe trap, GitHub Actions summary
4. ✅ Chaos CI gates — all 4 experiments in CI, cleanup traps, artifact upload
5. ✅ Code quality gates — custom ESLint plugin with fetch-requires-timeout and fetch-requires-error-handling
6. Notifications/dashboard — visibility layer on top of all gates (optional — can defer to after Phase 6)

## Package Extraction Plan
All quality tooling in `scripts/` is structured for future extraction into a shared npm package published to GitHub Packages.
- **Not yet** — only one tool (manifest validation) exists. Packaging a single module is premature
- **After Phase 5** — 2–3 tools (manifest validation, chaos reporting, code quality). Shape is becoming clear but still evolving
- **After Phase 7 (LLMOps)** — 4+ tools (add AI assertions, golden sets). This is the extraction point
- **Package name:** `@joxkalna/platform-quality-utils` (scoped to GitHub username, private on GitHub Packages)
- **Pattern:** Multi-entry package with `exports` map — consumers cherry-pick what they need (`/manifest-validation`, `/chaos`, `/ai-assertions`)
- **Structure:** Extract to `packages/platform-quality-utils/` in this repo. Orchestrators in `scripts/` import from the package. Other projects in `development/` install via npm
- **Signal to extract:** When you find yourself copying code from this repo into another project
- See `docs/manifest-validation.md` → "Publishing Plan — GitHub Packages" for full details

## Phase 2 Resource Baseline
- Idle CPU: 1-13m per pod (limit: 200m)
- Idle memory: 11-15Mi per pod (limit: 128Mi)
- Significant headroom — Phase 4 will push toward limits to trigger throttling/OOMKills

## Phase 9 UI + Frontend Quality
Full plan, architecture, MR breakdown, and decisions documented in `docs/phase9-ui-frontend-quality.md`.

A minimal React UI for Service C's `/classify` endpoint. The UI is intentionally trivial — same philosophy as the backend services. The focus is on the quality engineering layers around it.

**What it adds:**
- New service boundary: UI (consumer) → Service A (provider) — Pact contract for `/classify` response shape
- Frontend performance budgets: Lighthouse CI gates (LCP, CLS, TTI)
- Browser-based load testing: k6 browser module — real Chromium sessions alongside HTTP load
- E2E functional tests: Playwright — user flows, error states, loading states
- Frontend chaos: Playwright assertions during backend failure injection

**MR breakdown:**
- MR 1 — UI scaffold + deploy to Kind (React app, Dockerfile, K8s manifest)
- MR 2 — Frontend Pact consumer (UI → Service A contract, can-i-deploy for 4 services)
- MR 3 — Playwright E2E (happy path, error states, CI integration)
- MR 4 — Lighthouse CI (performance budgets, artifact upload)
- MR 5 — k6 browser + frontend chaos (combined HTTP + browser load, chaos + Playwright assertions)

**Key insight — frontend contract testing:**
The UI's Pact consumer test doesn't need a browser. It tests the API client layer — the function that calls `/classify` and parses the response. Pact tests the contract between the UI's API client and Service A, not the UI rendering. This is one of the most common Pact use cases — frontend consumers write pacts against backend APIs so that backend changes can't break the UI without `can-i-deploy` catching it first.

**Depends on:** Phase 6 (k6 framework), Phase 7 (LLMOps golden sets), Phase 8 (Bruno API surface)
