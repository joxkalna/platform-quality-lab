# Phase 6 — Implementation Reference

## Service C Implementation

- `services/service-c/` — src/app.ts, src/server.ts, src/config.ts, src/llm.ts, src/types.ts, Dockerfile, package.json, tsconfig.json
- `k8s/service-c.yaml` — 2 replicas, resource limits, separate readiness (checks LLM) / liveness (/health)
- Endpoints: `POST /classify` (text → category + confidence), `GET /health`, `GET /ready`
- Zod validates all config at startup (LLM_ENDPOINT, model, temperature, timeout)
- Exports `app` for Pact provider verification
- All services refactored to app.ts + server.ts pattern (pure app, no side effects on import)
- Service A wired to call Service C (`POST /classify` via `SERVICE_C_URL` env var)

## Pact Provider Verification for Service C

- StubbedIntegrations pattern — fetch interceptor for Ollama API calls
- Fixtures: mock Ollama LLM responses (`tests/pact/fixtures/llm-responses.ts`)
- Stubs: `tests/pact/stubs/integrations/ollama.ts`
- State handlers: set up stubs before Pact replays requests
- Provider verification runs without a real LLM — stubs return deterministic responses

## CI Pipeline Changes

- Build, load, deploy Service C with Ollama on host
- Ollama runs on CI host (not in Kind — avoids disk space issues with `kind load`)
- `deploy-local.sh` updated for Service C + Ollama
- `can-i-deploy.sh` updated for 3 services (dev → qa → prod per service)
- Dependabot config updated for Service C

## Pact Evolution Exercises

### Breaking Change (type mismatch)

Branch: `learning-break-pact`

- Changed `confidence` from number to string
- Pact caught the breaking change (provider verification failed against deployed pact)
- Exposed monorepo limitation: coordinated changes in one commit still fail because provider verifies against *deployed* pact, not the branch pact
- `continue-on-error` and `[skip pact]` are workarounds, not solutions
- Open question: whether Pact's `consumerVersionSelectors` can be configured to only verify against the current branch during breaking changes, or whether this is a fundamental limitation of Pact in monorepos

### Expand and Contract (4 MRs)

Branch: `phase6/pact3` — using a `priority` field (P1–P4 mapped from category).

Each MR is independently reviewable, rollback-safe, and exercises the real Pact lifecycle. No `[skip pact]`, no `continue-on-error`, no break-glass.

| MR | Name | What changes | Pact state after merge |
|---|---|---|---|
| 1 | Expand — provider adds `priority` | Service C returns `priority` in `/classify` response. Consumer pact unchanged — does not assert on `priority` yet. Also: re-enabled pact job, registered `qa` environment, rewrote `can-i-deploy.sh` for 3-environment flow | Provider returns extra field, consumer ignores it — backwards compatible |
| 2 | Migrate — consumer starts using `priority` | Consumer pact test adds `priority: MatchersV3.string(...)` assertion. Provider already returns it → verification passes | Both sides agree on `priority` — consumer depends on it |
| 3 | Contract — consumer stops asserting `priority` | Consumer pact test removes `priority` assertion. Provider still returns it — extra fields ignored | Consumer no longer depends on `priority` — safe to remove from provider |
| 4 | Cleanup — provider removes `priority` | Service C removes `priority` from response. `can-i-deploy` confirms no consumer depends on it | Code back to starting state, Broker state clean, full lifecycle exercised |

### Friday-to-Monday Recovery (`severity` field)

| Step | What happened | Pipeline result |
|---|---|---|
| Setup | Provider added `severity` (SEV1–SEV4) + consumer added assertion — both merged to main | ✅ Both sides depend on `severity` |
| Friday hotfix | Provider removed `severity`, `PACT_ENABLED=false` in repo variables | ✅ Pact skipped, hotfix deployed |
| Monday recovery (commit 1) | Consumer removed `severity` assertion, `PACT_ENABLED=true`, `continue-on-error` on provider verification | ✅ Provider verification fails against old deployed pact (expected), `record-deployment` updates Broker |
| Monday recovery (commit 2) | Removed `continue-on-error` | ✅ Provider verification passes, pipeline fully clean |

**Pipeline restructure:** Verification (pact job) and deployment recording (deploy-and-test job) are in separate stages. Verification failure no longer blocks `record-deployment`. Recovery after break-glass is now a single commit — no `continue-on-error` needed.

**CI improvement discovered:** `[skip pact]` in commit messages doesn't work on PR merges — `github.event.head_commit.message` only sees the merge commit. Replaced with `PACT_ENABLED` repository variable (`vars.PACT_ENABLED != 'false'`).

---

## Pipeline Integration Tests — Patterns for Service C

Service C introduces a real processing pipeline: prompt construction → LLM call → response parsing → confidence scoring.

**Pattern:** Spin up real infrastructure in a container, send real input through it, assert on what comes out the other side. This is how production observability pipelines are tested — a test harness starts the real service, sends data in, and a mock exporter on the output side captures what was produced.

**Why this doesn't apply to Services A and B:** They're HTTP pass-throughs with no transformation. Data goes in and comes out unchanged.

**Why it applies to Service C:** The AI service processes input (builds prompts, parses responses, scores confidence). Bugs hide in that processing layer. An HTTP status 200 with the right shape doesn't mean the prompt was constructed correctly or the confidence score was calculated right.

**What this means concretely:**
- Current integration tests (axios + HTTP assertions) stay for Services A and B
- Service C gets an additional test layer: start the service, send known inputs, assert the full output (not just status + shape, but content correctness)
- This is where golden set assertions (Phase 7 LLMOps) plug in

---

## Observability as a Test Layer (Future)

Services A and B have no instrumentation — we assert on HTTP responses and kubectl output. Service C should add OpenTelemetry (traces, metrics) so that tests can assert on what happened *inside* the pipeline:

- Did the LLM call span have the right duration? (latency regression)
- Did the prompt construction step emit the expected attributes? (transformation correctness)
- Did the confidence score metric fall within expected range? (output quality)

This is how production observability pipelines are tested — a test harness sends data through real infrastructure and asserts on the telemetry it produces, not just the HTTP response.

### The Timeout Observability Gap

When a service times out or crashes, the OTEL SDK may not get a chance to flush its spans — the process is killed mid-flight and the telemetry for that invocation is lost. Dashboards show nothing, but the failure happened.

This is a real production problem: timeouts pile up silently, queues fill, and nobody knows until someone digs through raw logs.

Service C should explore this gap — if the LLM call times out, does the trace still get exported? If not, how do you detect it? The answer involves either flush-before-timeout patterns or a fallback telemetry path (e.g. log-based fallback → forwarder → collector).

---

## Testing Approaches for the Processing Layer

| Approach | What it tests | When to use |
|---|---|---|
| HTTP assertions (what we have now) | Status codes, response shape | Always — baseline for every service |
| Pipeline integration tests (harness pattern) | Full input → output correctness through real infrastructure | Services with transformation logic (Service C) |
| OpenTelemetry trace assertions | Internal processing steps, latency per stage, attribute correctness | When you need to know *how* the service processed the request, not just the result |
| Snapshot/regression tests | Output stability across code changes | When prompt or model changes could silently degrade quality |
| Contract tests (Pact) | API shape agreement between services | Always — for every service-to-service boundary |

---

## k6 Load Testing MR Details

### MR 1 — Framework scaffold + smoke test

- `tests/load/` directory with full 3-layer structure (requests → flows → scenarios)
- Native k6 TypeScript (no webpack, no babel, no build step)
- Request functions for Services A and B (health, ready, data, info)
- Flow functions composing requests into reusable groups with `group()`
- Three scenario types: `healthCheck` (isolated), `dataFlow` (isolated), `fullJourney` (chained)
- Load profiles: `local-test.json`, `smoke-test.json`
- `handleSummary` for JSON + text output
- Logger utility (debug/info controlled by `__ENV.DEBUG`)
- Request params helper (headers, transaction tags, timeout)
- Type declarations for remote URL imports (`k6-libs.d.ts`)
- CI: k6 installed, smoke test runs after integration tests, before chaos

Design decisions:
- Functional programming style — arrow functions, no classes. Matches k6's own API
- `fail()` on check failure stops the VU iteration immediately
- `group()` in flows gives aggregated metrics per flow, transaction tags give per-endpoint metrics
- k6 requires `.ts` extensions on local imports. `allowImportingTsExtensions: true` in tsconfig

### MR 2 — Load + stress profiles + regression analysis

- Load profiles: `load-test.json`, `stress-test.json`, `regression-test.json`
- `scripts/compare-summary.ts` — regression analysis (10% threshold, 3 metrics)
- GitHub Actions: upload `summary.json` as artifact after every load test
- Committed baseline file (`tests/load/baseline.json`)
- Branch-vs-main comparison: feature branches download main's artifact and compare

### MR 3 — Slack notifications + dashboard

- Slack webhook alerts: perf regression, chaos failure, smoke failure
- Reusable `scripts/notify/slack.ts` with Block Kit helpers
- Trend extraction: `tests/load/scripts/extract-trend.ts`, `scripts/chaos/extract-trend.ts`
- Static HTML dashboard (`docs/dashboard/index.html`) with Chart.js
- Artifact-as-database pattern: download previous → append → re-upload
- `scripts/dashboard/download-trend.sh` — GitHub REST API artifact download
- Dashboard deployed on main only via `deploy-pages@v4`

---

## Other Phase 6 Changes

- Dependencies updated across all services (Express 5, TypeScript 6, @types/node 25)
- Chaos summary renderer rewritten in TypeScript
- README cleaned up as a landing page
- ESLint resilience rules improved (understands utility functions that throw)
- Provider verification docs expanded (stubbing patterns, multi-provider, scaling)
- Break-glass procedure documented (`docs/pact/break-glass.md`)
