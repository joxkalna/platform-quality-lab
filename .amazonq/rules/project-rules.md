# Platform Quality Lab — Project Rules

## Project Purpose
This is a learning project for SDET/platform quality engineering skills, mapped to an AI infrastructure-style role. The goal is to build a microservices system, deploy it on Kubernetes, break it intentionally, and encode learnings into CI guardrails.

## Project Mindset
Treat this project as if it's a real service running in a large organisation. Use production-grade tooling, patterns, and practices — even if the services themselves are simple. The services are intentionally trivial because the focus is on the platform, pipeline, and quality engineering around them — not the business logic. Never dismiss a tool or pattern as "overkill" — if it's used in real orgs, it belongs here.

## Hard Rules — Non-Negotiable
These rules exist because they were violated during development and caused real damage. They are not guidelines — they are absolute.

1. **Never run `record-deployment`, `publish`, or `can-i-deploy` from the terminal.** These are CI-only operations. The pipeline is the single source of truth for what's deployed. Running them locally pollutes the Broker with untraceable versions and breaks `can-i-deploy` for every service. The only local Pact commands allowed are `npm run test:pact` (consumer tests) and `npm run test:pact:verify` (provider verification).

2. **Never record deployments from feature branches.** `record-deployment` only runs on the protected main branch, after a real deployment. A feature branch pact is a proposal, not a deployment. Recording it as deployed pollutes the Broker's `deployedOrReleased` selectors and causes provider verification failures when the branch is reverted.

3. **Never modify scripts that are designed to be reusable across projects based on a single project's quirks.** `initialise-provider.sh` mirrors the pattern from a production provider initialisation repo. If it fails on PactFlow but works on a self-hosted broker, the fix belongs in PactFlow-specific documentation — not in the script itself.

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
- **Phase 7** AI quality guardrails — non-deterministic assertion patterns, golden set benchmarks, accuracy thresholds as CI gates, consistency tests

## Phase 6 Load Testing with k6
k6 is deferred to Phase 6 because Services A and B are HTTP pass-throughs with minimal resource usage (11-15Mi memory, 1-13m CPU). Load testing them confirms they handle concurrent requests but there's little to discover.

Service C (AI) changes this — it has real processing (prompt construction, LLM calls, response parsing, confidence scoring) that consumes meaningful CPU and memory. k6 becomes valuable for:
- **Performance baselines** — what's the p95 response time for classification under normal load?
- **Breaking point discovery** — at what concurrency does Service C OOMKill or start timing out?
- **Regression detection** — did this prompt change make the service 2x slower?
- **Chaos + load combined** — does the system perform under load WHILE a pod dies? This is the real production scenario

**k6 framework structure**:
```
tests/load/
├── config/
│   ├── smoke-test.json          # Single iteration, verify scripts work
│   ├── load-test.json           # Sustained load at expected traffic levels
│   └── stress-test.json         # Push beyond limits to find breaking point
├── scenarios/
│   ├── health-check.ts          # Baseline — hit /health on all services
│   ├── data-pipeline.ts         # Service A → B chain under load
│   └── ai-classification.ts     # Service C processing under load
├── utils/
│   └── thresholds.ts            # Shared threshold definitions
└── k6.config.ts
```

The framework follows a 3-layer separation common in production k6 setups:
- **Scenarios** — user journeys composed of transactions (e.g. "browse → classify → rate")
- **Transactions** — logical steps composed of requests (e.g. "classify" = call Service C, parse response)
- **Requests** — single HTTP calls with check assertions (e.g. `POST /classify` with status + body checks)

Same request function reused across transactions, same transaction reused across scenarios. Load profiles (thresholds, VU counts, durations) live in external JSON configs — swap profiles without changing test code.

**CI integration:**
- Smoke test on every push (single iteration — validates scripts work)
- Load test on merge to main (sustained load — catches performance regressions)
- Stress test on-demand or nightly (finds breaking points — too slow for every push)

**Regression detection:**
Compare current results against baseline metrics with a threshold (e.g. 10% deviation). If p95 latency increases by more than 10% from the previous run, the pipeline fails. Same pattern as the golden set accuracy threshold in Phase 7 — a ratchet that prevents silent degradation.

## Phase 6 Pact Evolution
Adding Service C creates a new service boundary and an opportunity to exercise real-world Pact scenarios that don't come up when you only have two services.

**New contracts:**
- Service A (consumer) → Service C (provider) — new pact for `/classify`
- Service A (consumer) → Service B (provider) — unchanged

**Scenarios to exercise:**

| Scenario | What happens | What it teaches |
|---|---|---|
| Add new provider | Initialise Service C on PactFlow, consumer writes first pact, provider verifies | Full provider onboarding workflow (second time — reinforces the process) |
| Backwards compatible change | Service C adds a new field to response — consumer pact doesn't break | Pact allows extra fields — additive changes are safe |
| Breaking change (remove field) | Service C drops a field the consumer depends on | Pact catches it — can-i-deploy blocks the deployment |
| Breaking change (change type) | Service C changes `confidence` from number to string | Pact catches the type mismatch before it reaches production |
| Consumer starts using new field | Service A starts asserting on a new field from Service C | Consumer-driven — new pact published, provider must verify |
| Deprecate an endpoint | Service B wants to remove `/info` | can-i-deploy blocks it because Service A still depends on it |

The goal is to see Pact catch a breaking change in CI — not just read about it. Deliberately break a contract, watch can-i-deploy block the deployment, then fix it. That's the learning that sticks.

**Order:**
1. Build Service C with `/classify` endpoint
2. Add Pact consumer test in Service A for Service C
3. Initialise Service C as provider on PactFlow
4. Add provider verification to Service C
5. Wire into CI (publish, verify, can-i-deploy for all 3 services)
6. Deliberately break a contract — observe Pact catching it
7. Fix the contract — observe can-i-deploy going green

**Monorepo vs reality:**
All three services stay in one repo for Phase 6. This simplifies CI (one pipeline, one commit SHA for all services) but doesn't reflect production where each service would be its own repo with its own pipeline. The Pact patterns (consumer tests, provider verification, can-i-deploy, record-deployment) are identical in both setups — only the trigger changes. In a monorepo, verification runs in the same pipeline. In multi-repo, a webhook triggers the provider's pipeline when a consumer publishes a new pact. The monorepo `can-i-deploy` workaround (checking both services at the same commit) is already documented in `scripts/pact/can-i-deploy.sh` with the multi-repo equivalent in comments. See `docs/pact/06-repo-separation.md` for the full mapping.

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
- This is where golden set assertions (Phase 7) plug in — the test harness sends golden set inputs and asserts on accuracy
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

**Next:**
- Revert breaking change (don't merge the learning branch)
- Resolve the monorepo breaking change workflow — how to deploy a coordinated API change without [skip pact] or continue-on-error
- k6 load testing framework
- Integration tests for Service C (deferred to Phase 7 golden sets — Pact covers API shape)

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
- Same pattern used by NestJS (`NestFactory.create`), Express testing guides, and production Express/Fastify apps

Apply this when refactoring after Phase 7 — it touches every service and every test that imports `app.ts`.

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
- `imagePullPolicy: Never` is safe in Kind — images are pre-loaded via `kind load`, no registry involved. In a real cluster (EKS/GKE) you'd use a container registry instead

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
- Monorepo `can-i-deploy` checks both services at the same commit version (production multi-repo pattern documented in comments)
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
- **After Phase 7** — 4+ tools (add AI assertions, golden sets). This is the extraction point
- **Package name:** `@joxkalna/platform-quality-utils` (scoped to GitHub username, private on GitHub Packages)
- **Pattern:** Multi-entry package with `exports` map — consumers cherry-pick what they need (`/manifest-validation`, `/chaos`, `/ai-assertions`)
- **Structure:** Extract to `packages/platform-quality-utils/` in this repo. Orchestrators in `scripts/` import from the package. Other projects in `development/` install via npm
- **Signal to extract:** When you find yourself copying code from this repo into another project
- See `docs/manifest-validation.md` → "Publishing Plan — GitHub Packages" for full details

## Phase 2 Resource Baseline
- Idle CPU: 1-13m per pod (limit: 200m)
- Idle memory: 11-15Mi per pod (limit: 128Mi)
- Significant headroom — Phase 4 will push toward limits to trigger throttling/OOMKills
