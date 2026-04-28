# k6 Load Testing — Plan & Implementation Guide

Phase 6 load testing for platform-quality-lab. k6 tests the infrastructure's ability to handle traffic — can the pods, services, DNS, and K8s networking serve requests at the expected rate?

This document covers the full plan, broken into incremental MRs that build on each other.

---

## What k6 Tests vs What Chaos Tests

k6 and chaos experiments answer different questions:

| | k6 (load testing) | Chaos (failure injection) |
|---|---|---|
| **Question** | Can the infrastructure handle this traffic? | What happens when things break? |
| **Method** | Increase traffic, measure throughput/latency/errors | Inject a specific failure, observe behaviour |
| **Finds** | Bottlenecks, latency regressions, infrastructure limits | Recovery behaviour, timeout correctness, graceful degradation |
| **Scope** | Services A and B (HTTP endpoints, service-to-service) | All services including C (resource pressure, dependency failure, timeouts) |

### Why Service C is excluded from load testing

Service C runs Ollama with llama3.2:1b in Kind — a tiny model on constrained resources (200m CPU, 128Mi memory). Load testing it would just prove that a tiny LLM on tight limits is slow, which we already know.

The interesting questions about Service C under pressure — OOMKills, timeout behaviour, concurrent request queuing — are already answered by chaos experiments (resource pressure, dependency failure, latency injection).

Service C load testing becomes valuable when there's a real LLM backend worth profiling (GPU, autoscaling, cost/performance curves, prompt caching). That's not this project.

k6 still has a `/classify` request function for smoke tests (verify the endpoint works), but load and stress profiles focus on Services A and B.

### Infrastructure isolation — what k6 reveals

Testing each service independently isolates where bottlenecks live:

| Scenario | What it isolates |
|----------|------------------|
| Service B alone (`/health`, `/info`) | Raw throughput of the simplest service — baseline for the infrastructure |
| Service A alone (`/health`) | Same, but with the Express proxy layer |
| Service A → B chain (`/data`) | Service-to-service hop — K8s DNS resolution, networking, proxy overhead |

If Service A → B is slow but Service B alone is fast, the problem is in the networking/DNS layer, not the service code. That's infrastructure insight you can't get from chaos.

---

## Why k6

- Native TypeScript support (k6 v1.x runs `.ts` files directly)
- External JSON load profiles — swap profiles without changing test code
- `handleSummary` hook for custom output (JSON, HTML, JUnit)
- Built-in `check` assertions with tagged metrics
- Built-in `group()` for logically grouping requests and getting aggregated metrics
- Built-in scenarios with executors (constant rate, ramping, shared iterations)
- Runs locally and in CI with the same scripts
- Well-documented, large community, used widely in production orgs

## Architecture

```
tests/load/
├── src/
│   ├── config/                    # Load profiles (JSON)
│   │   ├── local-test.json        # Single iteration, debug
│   │   ├── smoke-test.json        # Low rate, validate scripts work
│   │   ├── regression-test.json   # Branch feedback (~3.5 min)
│   │   ├── load-test.json         # Sustained load at expected levels
│   │   └── stress-test.json       # Push beyond limits, find breaking points
│   ├── requests/                  # Single HTTP calls with check assertions
│   │   ├── service-a-api.ts       # /health, /ready, /data
│   │   └── service-b-api.ts       # /health, /info
│   ├── flows/                     # Reusable groups of requests (k6 group() for aggregated metrics)
│   │   ├── health-checks.ts       # Hit /health on all services
│   │   └── data-flow.ts           # Service A → B chain
│   ├── scenarios/                 # User journeys — exported as k6 scenario functions
│   │   ├── health-check-scn.ts    # Isolated baseline — health endpoints only
│   │   ├── data-flow-scn.ts       # Isolated — A → B data flow only
│   │   └── full-journey-scn.ts    # Chained — health checks then data flow
│   ├── utils/
│   │   ├── logger.ts              # Debug/info logger (controlled by __ENV.DEBUG)
│   │   ├── request-params.ts      # Shared request params (headers, tags, timeout)
│   │   ├── handle-summary.ts      # handleSummary — JSON + text output
│   │   └── k6-libs.d.ts           # Type declarations for remote URL imports
│   ├── index.ts                   # k6 entrypoint — setup, scenario exports, handleSummary
│   └── types.ts                   # Shared types (TestConfig, Endpoint)
├── scripts/
│   └── compare-summary.ts         # Regression analysis (compare current vs baseline)
├── results/                       # k6 output (gitignored, uploaded as CI artifact)
├── tsconfig.json                  # TypeScript config (noEmit, allowImportingTsExtensions)
└── package.json                   # @types/k6 only — no build dependencies
```

### 3-Layer Separation

The framework uses a 3-layer separation to keep tests maintainable as the number of services and endpoints grows:

| Layer | Directory | What it does | Example |
|-------|-----------|-------------|---------|
| Requests | `requests/` | Single HTTP call + `check` assertion | `GET /health` → assert status 200 |
| Flows | `flows/` | Reusable groups of requests, shared across scenarios | "check all health endpoints" = hit A + B health |
| Scenarios | `scenarios/` | User journeys — the functions k6 executes | "health check all → fetch data → verify" |

**Why this separation:**

k6's built-in concepts are **scenarios** (executors, VUs, thresholds — defined in JSON config) and **groups** (`group()` function for aggregated metrics). k6 doesn't prescribe how to organise your code beyond that.

The 3-layer separation is our own code organisation choice, not a k6 concept:

- **Requests** — one function per HTTP call. Each function calls `http.get`/`http.post`, runs `check()` assertions, and tags metrics. This is the atomic unit. Reusable across any flow or scenario.
- **Flows** — extracted functions that compose multiple requests into a reusable step. When two scenarios share the same sequence of requests (e.g. "hit all health endpoints"), the shared logic lives here instead of being duplicated. Uses k6's `group()` to get aggregated metrics per flow. This layer exists purely to avoid duplication — if every scenario is unique, you don't need it.
- **Scenarios** — the functions k6 actually executes. Each scenario composes flows (or calls requests directly for simple cases). The JSON config maps scenario names to these functions via `exec`.

The key insight: requests are reused across flows, flows are reused across scenarios. Without this separation, adding a new scenario that shares steps with an existing one means copy-pasting request code. With it, you compose from existing pieces.

With only 2 services under load test, the flows layer may feel thin initially. It earns its place when scenarios grow (e.g. a future scenario that checks health, fetches data, then checks health again — reusing the health-check flow).

Load profiles (thresholds, VU counts, durations) live in external JSON configs — completely separate from the test code.

## Reusable k6 Patterns

This section documents reusable patterns for k6 load testing and how they map to this project. The goal is to use real patterns — not toy examples — while adapting for the constraints of a Kind cluster and GitHub Actions.

### Take directly

| Pattern | What it is | Why it works here |
|---------|-----------|------------------|
| Native k6 TypeScript | k6 v1.x runs `.ts` files directly, no build step | Simpler than webpack, fewer moving parts, same type safety via `@types/k6` |
| External JSON load profiles | Thresholds, VU counts, durations in JSON — separate from test code | Swap profiles without changing code |
| Logger utility | `__ENV.DEBUG` flag controls debug/info output | Clean, no dependencies, works in k6 runtime |
| Request params helper | Shared function for headers, transaction tags, timeout defaults | Avoids duplication across request functions |
| handleSummary | JSON + text output from k6's summary hook | Standard output format, CI-friendly |
| Regression analysis script | TypeScript script comparing two `summary.json` files, exits non-zero on threshold breach | Production pattern for CI gates |
| Transaction tagging | Every request tagged with a transaction name for per-endpoint metrics | Enables per-scenario and per-endpoint thresholds in JSON config |
| `group()` in flows | Wraps related requests for aggregated `group_duration` metrics | Business-level latency visibility alongside per-request detail |

### Adapt for this project

| Production pattern | This project's adaptation | Why |
|-------------------|--------------------------|-----|
| Metrics streaming output | GitHub Actions artifacts + step summary | No metrics platform — use zero-infrastructure approach |
| Metrics agent sidecar in CI | Not needed | Metrics stay in summary.json, not streamed |
| Slack bot SDK with dashboard graphs | Simple webhook POST | No monitoring platform to link to — plain text alerts |
| CI platform API artifact download | `actions/download-artifact` | Different CI platform, simpler API |
| "Transactions" layer naming | "Flows" layer | Avoids confusion with k6's own `group()` concept |
| CSV test data with `SharedArray` | Not needed initially | Services return static data — no parameterisation needed. Add when `/classify` gets varied inputs |
| Environment-specific `.env` files | Single `.env` with `BASE_URL` | One environment (Kind cluster), not dev/qa/preprod |

### Skip entirely

| Production pattern | Why it doesn't apply |
|-------------------|---------------------|
| Monitoring platform dashboard graph configs | No metrics platform — deferred to post Phase 7 |
| Internal shared packages (coding standards, Slack bots) | Project-specific, not reusable across orgs |
| CI platform-specific artifact scraping scripts | GitHub Actions has native artifact support |
| Multi-environment test execution (dev/qa/preprod) | Single Kind cluster — one environment |

### Compute test pattern (added to MR 2)

A common approach is to run the same test profile against **two targets in parallel** — the branch deployment and the main/baseline deployment — then compare results directly. This is more rigorous than comparing against a stored baseline because both runs execute under identical CI conditions (same machine, same network, same time).

In this project's Kind cluster, we can't run two deployments simultaneously. Instead, the adaptation is:

1. On main: run load test, store `summary.json` as artifact + update committed baseline
2. On feature branches: run load test, download main's latest artifact, compare
3. If no previous artifact exists (first run), skip comparison with a warning

This gives branch-vs-main comparison without needing parallel deployments. The committed baseline (`tests/load/baseline.json`) serves as the permanent record — artifacts are the live comparison.

### JUnit output

k6 frameworks commonly output JUnit XML for CI test reporting. k6 supports this via the `k6-junit` package in `handleSummary`. GitHub Actions can display JUnit results with third-party actions. Worth adding in MR 1 — low effort, high visibility.

---

## Build Tooling: Native TypeScript

k6 v1.x runs TypeScript files directly — no build step needed. This replaces the webpack + babel approach that was the standard before native TS support matured.

**What this means:**
- `k6 run src/index.ts` just works
- No webpack config, no babel config, no build step
- `package.json` only needs `@types/k6` for IDE autocomplete
- Local imports require explicit `.ts` extensions (`import { info } from "./logger.ts"`)
- `tsconfig.json` needs `allowImportingTsExtensions: true` and `noEmit: true`
- Remote URL imports (e.g. `https://jslib.k6.io/...`) need a `.d.ts` file for type declarations

**Trade-off vs webpack:**
- Native TS can't bundle npm packages (e.g. `k6-junit` for JUnit output) — only k6 built-in modules and remote URL imports work
- If JUnit/HTML reports are needed later, either use remote URL versions or add webpack back
- For this project, JSON + text output from `handleSummary` is sufficient

## Load Profiles

### Local Test (debug)
Single iteration, one scenario, extended logging. For development and troubleshooting.

```json
{
  "scenarios": {
    "health-check-local": {
      "executor": "shared-iterations",
      "exec": "healthCheck",
      "iterations": 1,
      "maxDuration": "1m"
    }
  }
}
```

### Smoke Test
Low rate, short duration. Validates scripts work and endpoints are reachable.

```json
{
  "thresholds": {
    "http_req_failed": ["rate<0.05"],
    "checks": ["rate>0.95"],
    "http_req_duration": ["p(95)<2000"]
  },
  "scenarios": {
    "health-check-smoke": {
      "exec": "healthCheck",
      "executor": "constant-arrival-rate",
      "rate": 2,
      "timeUnit": "10s",
      "preAllocatedVUs": 5,
      "duration": "30s"
    },
    "data-flow-smoke": {
      "exec": "dataFlow",
      "executor": "constant-arrival-rate",
      "rate": 1,
      "timeUnit": "10s",
      "preAllocatedVUs": 5,
      "duration": "30s"
    }
  }
}
```

### Load Test
Sustained load at expected traffic levels. Ramps up, holds steady, ramps down.

```json
{
  "thresholds": {
    "http_req_failed": ["rate<0.05"],
    "checks": ["rate>0.95"],
    "http_req_duration": ["p(95)<2000"],
    "http_req_duration{scenario:data-flow-load}": ["p(90)<500"]
  },
  "scenarios": {
    "health-check-load": {
      "exec": "healthCheck",
      "executor": "ramping-arrival-rate",
      "startRate": 1,
      "timeUnit": "1s",
      "preAllocatedVUs": 5,
      "maxVUs": 50,
      "stages": [
        { "duration": "1m", "target": 5 },
        { "duration": "3m", "target": 5 },
        { "duration": "1m", "target": 0 }
      ]
    },
    "data-flow-load": {
      "exec": "dataFlow",
      "executor": "ramping-arrival-rate",
      "startRate": 1,
      "timeUnit": "1s",
      "preAllocatedVUs": 5,
      "maxVUs": 50,
      "stages": [
        { "duration": "1m", "target": 3 },
        { "duration": "3m", "target": 3 },
        { "duration": "1m", "target": 0 }
      ]
    }
  }
}
```

Running health checks and data flow in parallel reveals whether the service-to-service hop (A → B via K8s DNS) adds meaningful latency compared to direct health checks.

### Stress Test
Push beyond limits. Find breaking points — at what concurrency do pods start throttling, error rates spike, or K8s networking degrades?

```json
{
  "thresholds": {
    "http_req_failed": ["rate<0.20"],
    "http_req_duration": ["p(95)<5000"]
  },
  "scenarios": {
    "data-flow-stress": {
      "exec": "dataFlow",
      "executor": "ramping-arrival-rate",
      "startRate": 1,
      "timeUnit": "1s",
      "preAllocatedVUs": 10,
      "maxVUs": 100,
      "stages": [
        { "duration": "1m", "target": 5 },
        { "duration": "2m", "target": 15 },
        { "duration": "2m", "target": 30 },
        { "duration": "1m", "target": 0 }
      ]
    }
  }
}
```

Higher error tolerance (20%) and latency threshold (5s) — the point is finding the breaking point, not passing a gate. With tight resource limits (200m CPU, 128Mi memory), the infrastructure should hit its ceiling under stress.

## Regression Analysis

TypeScript script that compares two `summary.json` files and fails if any metric exceeds a threshold.

**Metrics compared:**
- `http_reqs.rate` — throughput (req/s). Drop > 10% = regression
- `http_req_duration.p(90)` — latency. Increase > 10% = regression
- `http_req_failed.rate` — error rate. Increase > 10% = regression

**How it works:**
1. k6 `handleSummary` writes `summary.json` after each run
2. CI uploads `summary.json` as a GitHub Actions artifact
3. On main branch, the analysis script downloads the previous run's artifact and compares
4. If any metric exceeds the threshold, the script exits non-zero → pipeline fails

**First run bootstrap:** No previous artifact exists on the first run. The script detects this and skips comparison with a warning.

## Slack Notifications

Personal Slack workspace with Incoming Webhooks. Same pattern as production.

**Setup:**
1. Create free Slack workspace
2. Create a Slack app with Incoming Webhooks enabled
3. Add webhook to a `#load-test-alerts` channel
4. Store webhook URL as `SLACK_WEBHOOK_URL` in GitHub Secrets

**When notifications fire:**
- Load test threshold violations (regression detected)
- Stress test results summary (always — for visibility)
- Optional: smoke test failures (shouldn't happen, so worth alerting)
- Extensible to chaos experiment failures

**Message format:**
```
⚠️ Performance Regression Detected
Project: platform-quality-lab
Branch: main
Pipeline: #123

❌ http_req_duration p90: 450ms → 620ms (+37.8%)
✅ http_reqs rate: 12.5 req/s → 12.1 req/s (-3.2%)
✅ http_req_failed: 0.5% → 0.8% (+60.0%)

📊 Summary: https://github.com/.../actions/runs/...
```

Simple webhook POST — no Slack SDK, no bot framework.

## Dashboard & Long-Term Tracking

### Phase 1: GitHub Actions artifacts + summary (MR 2)
- `summary.json` uploaded as artifact after each run
- Comparison rendered in GitHub Actions step summary (markdown table)
- Artifacts expire after 90 days (GitHub default) — sufficient for regression detection
- Zero infrastructure, zero cost

### Phase 2: Committed baselines (MR 2)
- Store baseline metrics in a committed JSON file (`tests/load/baseline.json`)
- Regression script compares against committed baseline
- Baseline updated manually when performance improves (ratchet pattern)
- Version-controlled, auditable, permanent

### Phase 3: Slack alerts (MR 3)
- Webhook notifications on threshold violations
- Channel becomes the team's performance feed
- Extensible to chaos alerts, Pact failures, etc.

### Phase 4: Cloud dashboards (future — post Phase 7)
- k6 supports native cloud output for real-time dashboards
- Free tier: 10k metrics, 50GB logs, 14-day retention
- Real dashboards, trend lines, alerting
- The JSON baselines in git remain the permanent record — cloud dashboards are the live view

Not implementing cloud dashboards now — it's infrastructure overhead that doesn't add learning value until we have enough runs to see trends. GitHub artifacts + Slack covers the feedback loop for MRs 1-3.

---

## MR Breakdown

### MR 1 — Framework scaffold + smoke test ✅

**Goal:** Learn k6, get the framework running locally and in CI.

**What was built:**
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
- npm scripts in root `package.json`: `test:load:local`, `test:load:smoke`
- `tests/load/package.json` with `@types/k6` only
- CI: k6 installed, smoke test runs after integration tests, before chaos
- CI: `summary.json` uploaded as artifact

**Design decisions made during implementation:**
- Functional programming style throughout — arrow functions, no classes. Matches k6's own API
- Isolated scenarios for baselines + chained journey for realistic traffic. Both are valuable: isolated tells you "how fast is this endpoint alone?", chained tells you "how does the system behave under realistic usage?"
- `fail()` on check failure stops the VU iteration immediately — don't waste time on a broken system
- `group()` in flows gives aggregated metrics per flow (`group_duration`), transaction tags on requests give per-endpoint metrics. Two levels of visibility
- k6 requires `.ts` extensions on local imports (unlike Node.js/bundler setups). `allowImportingTsExtensions: true` in tsconfig suppresses IDE errors

**Smoke baseline from first CI run (Kind cluster):**
- `checks`: 100%
- `http_req_failed`: 0%
- `http_req_duration` p95: ~15ms
- `group_duration` p95: ~26ms

**What we learned:**
- k6 native TS is production-ready in v1.x — webpack is no longer needed
- `group_duration` is the business-level metric (closer to real user experience than individual HTTP calls)
- Smoke baselines are about regression detection, not capacity — stable, tight, low variance numbers are the foundation for heavier load tests

---

### MR 2 — Load + stress profiles + regression analysis

**Goal:** Add real load profiles and automated regression detection with branch-vs-main comparison.

**What changes:**
- Load profiles: `load-test.json`, `stress-test.json`
- npm scripts: `test:load:load`, `test:load:stress`
- `scripts/compare-summary.ts` — regression analysis (10% threshold, 3 metrics: throughput, p90 latency, error rate)
- GitHub Actions: upload `summary.json` as artifact after every load test
- GitHub Actions: download previous main artifact on feature branches, compare
- GitHub Actions step summary with markdown comparison table (✅/⚠️ per metric)
- Committed baseline file (`tests/load/baseline.json`) — initial baseline from first run, updated manually (ratchet pattern)

**Branch-vs-main comparison (adapted regression test pattern):**

A common approach is to run the same profile against branch and main deployments in parallel. We can't do that in a single Kind cluster, so the adaptation is:

1. Main branch: run load test → upload `summary.json` as artifact → update committed baseline if improved
2. Feature branches: run load test → download main's latest `summary.json` artifact → compare
3. First run: no previous artifact → skip comparison with warning, establish baseline

The regression script compares:
- `http_reqs.rate` — throughput drop > 10% = regression
- `http_req_duration.p(90)` — latency increase > 10% = regression
- `http_req_failed.rate` — error rate increase > 10% = regression

Output format (rendered in step summary):
```
✅ http_reqs rate:           12.50 req/s → 12.10 req/s (-3.20%)
⚠️ http_req_duration p90:   150.00 ms → 210.00 ms (+40.00%)
✅ http_req_failed:          0.50% → 0.80% (+60.00%)
```

**CI integration:**
- Smoke test on every push (already from MR 1)
- Load test on every push (feature branches compare against main's artifact)
- Load test on main branch records the new baseline artifact
- Regression analysis runs after load test — exits non-zero on threshold breach
- Stress test: manual trigger only (workflow_dispatch) — too slow for every push

**What we learn:**
- Load profile design (ramping, sustained, cool-down)
- Regression detection patterns (relative comparison, not just absolute thresholds)
- GitHub Actions artifact download/comparison across workflow runs
- Baseline management (committed file vs CI artifacts)
- Branch-vs-main comparison without parallel deployments

**Acceptance criteria:**
- Load test runs on every push, produces summary.json
- On main: summary.json uploaded as artifact + baseline updated
- On feature branches: previous main artifact downloaded, comparison runs
- Regression script exits non-zero if any metric exceeds 10% threshold
- Step summary shows markdown comparison table
- First run without baseline passes with warning
- Stress test runnable on-demand via workflow_dispatch

---

### MR 3 — Slack notifications + monitoring

**Goal:** Wire up Slack for alerts, close the feedback loop.

**What changes:**
- Personal Slack workspace setup (documented in this file)
- `tests/load/scripts/slack-notify.ts` — webhook POST on threshold violation
- GitHub Secrets: `SLACK_WEBHOOK_URL`
- CI: Slack notification step after regression analysis
- Extend to chaos experiment failures (optional)
- Update docs with Slack setup instructions

**What we learn:**
- Slack Incoming Webhooks setup
- Webhook integration in CI
- Alert formatting and routing
- Extending notifications to other pipeline stages

**Acceptance criteria:**
- Threshold violation sends Slack message with metrics comparison
- Pass result does NOT send message (alert fatigue)
- Webhook URL stored as GitHub Secret, not in code
- Documented setup steps for recreating the Slack workspace

---

## CI Pipeline Integration

After all 3 MRs, the pipeline looks like:

```
install → lint ──────────┐
        → typecheck ─────┤
        → validate-k8s ──┤
        → pact ───────────┴→ deploy-and-test
                               ├── BATS infra tests
                               ├── Vitest integration tests
                               ├── k6 smoke test (every push, gates)
                               ├── k6 regression test (branches, ~3.5 min, non-blocking)
                               ├── k6 load test (main, 5 min, non-blocking)
                               ├── k6 regression analysis (every push, non-blocking)
                               ├── Slack alert (on regression, MR3)
                               ├── Chaos experiments (main only, gates)
                               └── Teardown (always)
```

### Test Types and When They Run

| Profile | File | Duration | When | Blocks pipeline? | Purpose |
|---------|------|----------|------|-----------------|----------|
| Smoke | `smoke-test.json` | 30s | Every push | **Yes** | Correctness — are endpoints alive and responding correctly? |
| Regression | `regression-test.json` | ~3.5 min | Feature branches | No | Early feedback — detect performance regressions before merge |
| Load | `load-test.json` | 5 min | Main only | No | Historical data — full baseline comparison, trend over time |
| Stress | `stress-test.json` | 6 min | Manual only | No | Exploratory — find breaking points, not a CI gate |
| Local | `local-test.json` | 1 iteration | Local dev | N/A | Development — verify scripts work |

### Why This Split

- **Smoke gates the pipeline** because a broken endpoint should block deployment
- **Regression/load don't gate** because CI environments have variance — a 12% latency spike might be infrastructure noise, not a real regression. Non-blocking means you see the signal without false-positive pipeline failures
- **Regression is shorter than load** because branches get pushed frequently — 3.5 min is acceptable overhead, 5 min is not
- **Load runs on main only** because it produces the authoritative trend data. Main is the stable reference point
- **Stress is manual** because you *want* it to fail — gating on it makes no sense

### Regression Analysis

After every regression/load test, `compare-summary.ts` compares the run against `baseline.json`:

| Metric | Regression if... | Direction |
|--------|------------------|-----------|
| `http_req_duration p90` | Increases > 10% | Higher = slower = bad |
| `http_req_failed rate` | Any errors (baseline is 0%) | Any errors = bad |
| `http_reqs rate` | Drops > 10% | Lower = less throughput = bad |

The script exits non-zero on regression but `continue-on-error: true` means the pipeline continues. When MR3 adds Slack, regressions trigger an alert.

### Usage

```bash
# Local development
npm run test:load:local              # single iteration, debug
npm run test:load:smoke              # 30s smoke test
npm run test:load:regression         # 3.5 min regression test
npm run test:load:load               # 5 min full load test
npm run test:load:stress             # 6 min stress test (find breaking points)
npm run test:load:analyze            # compare results/summary.json vs baseline.json
```

### Updating the Baseline

The baseline (`tests/load/baseline.json`) is a committed file — the ratchet pattern:

1. Run a load test (locally or download CI artifact)
2. Review the numbers
3. Update `baseline.json` with the new values
4. Commit with a message explaining why (e.g. "update baseline: optimised DNS caching")

Never silently accept slower performance. If the baseline needs loosening, document why.

### Port Forwarding in CI

k6 runs on the CI host, not inside the Kind cluster. Services are only reachable inside the cluster by default. Options:

1. **kubectl port-forward** — forward each service port to localhost. Simple, but needs background processes + cleanup
2. **NodePort services** — expose services on the Kind node's ports. Requires manifest changes or patches
3. **Docker network** — Kind cluster runs in Docker, CI host can reach the Docker network gateway

The integration tests already solve this in `setup.ts` with port-forwarding. k6 will use the same approach — port-forward in a setup step, run k6 against localhost, clean up in teardown.

### k6 Installation in CI

k6 is a single binary. Install in the CI job:

```yaml
- name: Install k6
  run: |
    curl -sL https://github.com/grafana/k6/releases/download/v1.0.0/k6-v1.0.0-linux-amd64.tar.gz | tar xz
    sudo mv k6-v1.0.0-linux-amd64/k6 /usr/local/bin/k6
```

Pin the version — same principle as Kind and kubeconform.

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Native TS over webpack | k6 v1.x runs `.ts` directly. No build step, no bundler config, no babel. Simpler, fewer moving parts |
| Functional style (arrow functions, no classes) | Matches k6's own API. One consistent style across the framework. k6 runtime is not class-friendly |
| Three scenario types (isolated + chained) | Isolated for baselines and bottleneck isolation, chained for realistic traffic patterns. Both are valuable |
| Separate `tests/load/` directory | Load tests are a different concern from unit/integration tests |
| Own `package.json` in `tests/load/` | Only `@types/k6` needed — no build dependencies |
| JSON load profiles | Swap profiles without changing test code — same test, different intensity |
| Smoke in CI, load on main only | Smoke is fast (30s), load is slow (5min). Every push gets smoke, main gets full load |
| Stress as manual trigger | Too slow and resource-intensive for every merge. Run on-demand or nightly |
| 10% regression threshold | Industry standard. Tight enough to catch regressions, loose enough to avoid flaky failures |
| Slack webhook over bot | Webhook is simpler, no OAuth, no bot framework. Sufficient for CI alerts |
| GitHub artifacts for baselines | Zero infrastructure, version-controlled via committed baseline file |
| Service C excluded from load profiles | LLM on constrained Kind resources — chaos experiments already cover failure behaviour. Load testing deferred to real LLM backend |
| Branch-vs-main comparison over stored-only baseline | Both runs under similar CI conditions gives more reliable comparison than a stale committed baseline alone |
| Load test on feature branches too | Early feedback — don't wait for main to discover a regression |
| `group()` in flows layer | Gives aggregated `group_duration` metrics per flow. Transaction tags on requests give per-endpoint detail. Two levels of visibility |
| `fail()` on check failure | Stops the VU iteration immediately. Don't waste time on a broken system |

## Chaos + Load Combined (Future)

The real production scenario: does the system perform under load WHILE a pod dies? This is where k6 and chaos experiments intersect.

**Pattern:**
1. Start k6 load test in background
2. While load is running, execute chaos experiment (pod kill, resource pressure)
3. k6 captures the impact — error rate spike, latency increase, recovery time
4. Assert that the impact is within acceptable bounds

This is deferred to after MR 3 — it requires both k6 and chaos to be stable in CI first. But the architecture supports it: k6 runs as a background process, chaos scripts run in the foreground, k6's `handleSummary` captures the full picture.

This is also where Service C could appear in load testing — not testing the LLM itself, but testing whether Service A's `/classify` proxy degrades gracefully when Service C is under chaos pressure while A and B are under load.

## Local Development

### Prerequisites
- k6 installed (`brew install k6`)
- Node.js (for `@types/k6` IDE support)
- Services running locally (`npm run dev`) or Kind cluster deployed

### Commands (after MR 1)
```bash
npm run test:load:local            # single iteration, debug logging
npm run test:load:smoke            # smoke test against local services
```

### Commands (after MR 2)
```bash
npm run test:load                  # sustained load test
npm run test:stress                # stress test (find breaking points)
npm run analyze                    # compare summary.json against baseline
```
