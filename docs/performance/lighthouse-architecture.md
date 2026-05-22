# Lighthouse CI — Architecture

Two complementary patterns for frontend performance quality: **CI gating** (blocks regressions) and **synthetic monitoring** (detects drift over time).

---

## Why Two Patterns?

| | CI Gate | Synthetic Monitoring |
|---|---|---|
| Trigger | Every PR | Cron schedule (e.g. every 6 hours) |
| Question | "Did this change make things worse?" | "Is the system degrading over time?" |
| Environment |  Kind cluster, torn down after | Starts services fresh each run |
| Outcome | Pass/fail — blocks merge | Data collection — alerts on drift |
| Catches | Bundle regressions, layout shifts, render-blocking code | Gradual degradation, infra drift, compounding small regressions |

Neither alone is sufficient:

- CI gate misses drift that happens across 20 small PRs (each individually passes)
- Synthetic monitoring doesn't block the PR that introduces a regression

Together they cover both "prevent" and "detect."

---

## Why Not `@lhci/cli`?

Lighthouse CI's official CLI (`@lhci/cli`) handles multiple runs, median calculation, assertions, and reporting out of the box. For page-load-only budgets, it's the simpler choice.

We use a custom runner because:

- **User flow timespans** — `@lhci/cli` assertions are page-load focused. We need per-interaction measurement (type → click → result) with INP/TBT/CLS per step. This is where the platform value lives — backend latency surfacing in frontend metrics.
- **Owner tags** — each interaction step is tagged with a responsible team. `@lhci/cli` has no concept of this.
- **Dashboard integration** — we extract structured JSON for our trend data. `@lhci/cli` outputs its own format that doesn't map cleanly to our `lighthouse-trend.json` schema.

If we only needed "is LCP under 3 seconds?" — use `@lhci/cli`. Since we need "which interaction regressed and who owns it?" — custom runner.

### Multiple Iterations + Median

Lighthouse results are noisy (CPU scheduling, GC timing, network jitter). Running multiple times and taking the median gives stable results. `@lhci/cli` does this with `numberOfRuns`.

We currently run a single iteration for speed. If CI results prove too noisy (flaky passes/failures), add iteration support:

```typescript
// future: run 3 times, take median
const ITERATIONS = Number(process.env.LIGHTHOUSE_ITERATIONS) || 1;
results = await runLighthouse(URL, runClassifyFlow, ITERATIONS);
```

The runner already accepts an `iterations` parameter — the median logic can be added when needed without changing the test file or thresholds.

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                        CI Gate (PR-time)                       │
│                                                                │
│  deploy-and-test.yml                                           │
│  ┌──────────┐    ┌───────────┐    ┌────────────┐               │
│  │ Deploy   │───▶│ Lighthouse│───▶│ Assert     │──▶ pass/fail  │
│  │ to Kind  │    │ user flow │    │ thresholds │               │
│  └──────────┘    └───────────┘    └────────────┘               │
│                        │                  │                    │
│                        ▼                  ▼                    │
│                  HTML report        Slack (on failure)         │
│                  (artifact)         owner-aware alert          │
└────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                 Synthetic Monitoring (scheduled)                │
│                                                                 │
│  lighthouse-synthetic.yml (cron)                                │
│  ┌──────────┐    ┌───────────┐    ┌────────────┐                │
│  │ Start    │───▶│ Lighthouse│───▶│ Append to  │──▶ trend data  │
│  │ services │    │ user flow │    │ trend JSON │                │
│  └──────────┘    └───────────┘    └────────────┘                │
│                                          │                      │
│                        ┌─────────────────┼──────────────┐       │
│                        ▼                 ▼              ▼       │
│                  Dashboard tab     Drift detection    Slack     │
│                  (GitHub Pages)    (rolling avg)      (on drift)│
└─────────────────────────────────────────────────────────────────┘
```

---

## What Lighthouse Measures (That k6 Doesn't)

k6 measures backend HTTP latency. Lighthouse measures what the **user sees in a browser**:

```
User clicks "Classify"
  │
  ├── Browser dispatches fetch        ← k6 measures from here
  │     └── Service A processes
  │           └── Service C responds
  │     └── Response returns
  ├── React re-renders                ← Lighthouse measures this
  ├── DOM updates                     ← and this
  ├── Layout recalculates             ← and this
  └── Result visible to user          ← to here
```

The gap between "response received" and "result visible" is browser rendering time — React reconciliation, layout, paint. This is invisible to HTTP-level tests.

---

## Metrics

### Navigation (page load)

| Metric | What it measures | Budget |
|--------|-----------------|--------|
| LCP (Largest Contentful Paint) | Time until main content visible | < 3000ms |
| CLS (Cumulative Layout Shift) | Visual stability during load | < 0.1 |
| TBT (Total Blocking Time) | Main thread blocked (janky) | < 500ms |
| FCP (First Contentful Paint) | Time until first pixel rendered | < 2000ms |

### Interaction (user flow steps)

| Metric | What it measures | Budget |
|--------|-----------------|--------|
| INP (Interaction to Next Paint) | Click → visual response | < 2000ms |
| TBT (Total Blocking Time) | Thread blocked during interaction | < 300ms |
| CLS (Cumulative Layout Shift) | Layout shift caused by interaction | < 0.05 |

Budgets are lenient — we're running in Kind (local Docker network, no CDN, no edge caching). Production would tighten these.

Classification thresholds (good/needs-improvement/poor) follow [Google's Core Web Vitals](https://web.dev/vitals/) — the same thresholds used in Chrome DevTools and PageSpeed Insights:

| Metric | Good | Needs Improvement | Poor | Source |
|--------|------|-------------------|------|--------|
| LCP | ≤ 2500ms | ≤ 4000ms | > 4000ms | web.dev/lcp |
| CLS | ≤ 0.1 | ≤ 0.25 | > 0.25 | web.dev/cls |
| TBT | ≤ 300ms | ≤ 600ms | > 600ms | web.dev/tbt |
| INP | ≤ 200ms | ≤ 500ms | > 500ms | web.dev/inp |

### Drift Detection Threshold

The synthetic monitoring uses a **25% drift threshold** over a 7-day rolling average. This is higher than our k6 regression threshold (10%) because Lighthouse results have more variance — browser rendering is affected by CPU scheduling, garbage collection timing, and layout complexity in ways that HTTP latency isn't.

If 25% proves too noisy (false alerts) or too lenient (misses real drift), adjust `DRIFT_THRESHOLD_PERCENT` in `scripts/lighthouse/detect-drift.ts`.

---

## Owner Tags

Each interaction step is tagged with an owner. When a threshold breaks, the alert identifies who should investigate:

```typescript
interactions: {
  'type-text':        { owner: 'ui',        inp: 500  },
  'click-classify':   { owner: 'ui',        inp: 300  },
  'result-displayed': { owner: 'service-a', inp: 2000 },
}
```

- `type-text` regresses → UI rendering problem (React, DOM)
- `click-classify` regresses → UI event handling
- `result-displayed` regresses → backend latency (Service A → C chain)

The same test, but the owner tag routes the alert to the right team.

---

## Data Flow

### CI Gate

```
Lighthouse run
  → results/summary.json (per-run metrics)
  → compare against thresholds.ts
  → PASS: upload HTML report as artifact
  → FAIL: upload HTML report + Slack notification (owner + metric + value + budget)
```

### Synthetic Monitoring

```
Lighthouse run (cron)
  → results/summary.json
  → scripts/lighthouse/append-trend.ts
      → classifies each metric: good / needs-improvement / poor
      → appends to docs/dashboard/lighthouse-trend.json
      → compares against 7-day rolling average
      → DRIFT DETECTED: Slack notification
  → commit trend JSON to gh-pages branch
  → dashboard renders new data point
```

---

## Drift Detection vs Threshold Assertion

| | CI Gate | Synthetic Monitoring |
|---|---|---|
| Comparison | Current run vs fixed threshold | Current run vs rolling average |
| Example | "LCP must be < 3000ms" | "LCP increased 25% vs 7-day average" |
| Sensitivity | Binary — pass or fail | Gradual — spots trends |
| False positives | Low (threshold is generous) | Possible (noisy environments) |

Drift detection catches the scenario where LCP goes 1800 → 1900 → 2000 → 2100 → 2200 over 5 merges. Each individually passes the 3000ms threshold, but the trend is clearly degrading.

---

## File Structure

```
tests/lighthouse/
├── config/
│   └── thresholds.ts              ← performance budgets + owner tags
├── flows/
│   └── classify.ts                ← page object (selectors + interactions)
├── utils/
│   └── runner.ts                  ← Puppeteer + Lighthouse setup/teardown
├── classify.test.ts               ← vitest test (CI gate assertions)
├── vitest.config.mts              ← single-thread, long timeout
└── results/                       ← gitignored (HTML reports, summary JSON)

scripts/
├── notify/
│   └── lighthouse-regression.ts   ← Slack on threshold breach (owner-aware)
└── lighthouse/
    └── append-trend.ts            ← extract metrics → classify → append trend JSON

docs/dashboard/
├── lighthouse-trend.json          ← historical data (appended by synthetic runs)
└── index.html                     ← new "Web Vitals" tab

.github/workflows/
├── deploy-and-test.yml            ← Lighthouse gate step (after deploy)
└── lighthouse-synthetic.yml       ← cron schedule (synthetic monitoring)
```

---

## CI Integration

### Gate (deploy-and-test.yml)

```yaml
- name: Lighthouse CI gate
  run: |
    kubectl port-forward svc/ui 8080:80 &
    sleep 3
    npm run test:lighthouse
  
- name: Upload Lighthouse report
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: lighthouse-report
    path: tests/lighthouse/results/

- name: Slack — notify on Lighthouse failure
  if: failure()
  run: npx tsx scripts/notify/lighthouse-regression.ts
```

### Synthetic (lighthouse-synthetic.yml)

```yaml
name: Lighthouse Synthetic Monitoring
on:
  schedule:
    - cron: '0 */6 * * *'   # every 6 hours
  workflow_dispatch:          # manual trigger

jobs:
  monitor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run dev &
      - run: sleep 5
      - run: npm run test:lighthouse
      - run: npx tsx scripts/lighthouse/append-trend.ts
      - name: Commit trend data
        run: |
          git config user.name "github-actions"
          git config user.email "actions@github.com"
          git add docs/dashboard/lighthouse-trend.json
          git commit -m "chore: lighthouse synthetic data [skip ci]" || true
          git push
      - name: Slack — notify on drift
        if: env.DRIFT_DETECTED == 'true'
        run: npx tsx scripts/notify/lighthouse-drift.ts
```

---

## Dashboard Tab

The "Web Vitals" tab shows:

- **LCP over time** — line chart, threshold line at 3000ms
- **CLS over time** — line chart, threshold line at 0.1
- **Classify INP over time** — line chart, threshold line at 2000ms
- **Status table** — each metric classified as good/needs-improvement/poor per run

Same Chart.js approach as existing Performance/Chaos/LLMOps tabs.

---

## Package Extraction (Future)

The runner logic (`utils/runner.ts`) is generic — browser lifecycle, metric extraction, median calculation, report generation. The flow definitions and thresholds are app-specific. This maps to a shared package pattern:

```
┌─────────────────────────────────────────────────────────────────┐
│  Current (mono-repo)                                            │
│                                                                 │
│  tests/lighthouse/                                              │
│  ├── utils/runner.ts        ← generic engine (future package)   │
│  ├── flows/classify.ts      ← app-specific flow                 │
│  ├── config/thresholds.ts   ← app-specific budgets              │
│  └── classify.test.ts       ← app-specific assertions           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Future (multi-repo + shared package)                           │
│                                                                 │
│  package: @platform-quality/lighthouse-core                     │
│  ├── launchBrowser()                                            │
│  ├── runSingleIteration()                                       │
│  ├── extractResults()                                           │
│  ├── medianResults()                                            │
│  └── writeResults()                                             │
│                                                                 │
│  repo: ui-app                                                   │
│  └── tests/lighthouse/                                          │
│      ├── flows/classify.ts         ← imports from package       │
│      ├── config/thresholds.ts      ← owns its own budgets       │
│      └── classify.test.ts          ← owns its own assertions    │
│                                                                 │
│  repo: admin-dashboard                                          │
│  └── tests/lighthouse/                                          │
│      ├── flows/dashboard.ts        ← different flow             │
│      ├── config/thresholds.ts      ← different budgets          │
│      └── dashboard.test.ts         ← different assertions       │
└─────────────────────────────────────────────────────────────────┘
```

Each app repo defines **what to test** (flows, thresholds). The shared package handles **how to test** (browser, Lighthouse, extraction, reporting). App teams don't need to know about Puppeteer launch args or median calculation — they just define their user journey and budgets.

---

## Multi-Repo Reality

This project is a mono-repo — all services, UI, and tests live together. In a real org, these would be separate repos owned by separate teams:

```
┌──────────────────────────────────────────────────────────────────────┐
│  Current (mono-repo)                                                 │
│                                                                      │
│  platform-quality-lab/                                               │
│  ├── services/service-a/     ← all in one repo                      │
│  ├── services/service-b/     ← all changes trigger all tests        │
│  ├── services/service-c/     ← Lighthouse runs on every PR          │
│  ├── services/ui/                                                    │
│  └── tests/lighthouse/                                               │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  Real org (multi-repo)                                               │
│                                                                      │
│  repo: ui-app                                                        │
│  ├── src/                                                            │
│  └── tests/lighthouse/       ← CI gate (runs on PR to this repo)    │
│       └── classify.test.ts      blocks merge on threshold breach     │
│                                                                      │
│  repo: service-a             ← owned by backend team                 │
│  repo: service-c             ← owned by AI/ML team                   │
│                                                                      │
│  repo: synthetic-monitoring  ← owned by platform/performance team    │
│  └── specs/                  ← scheduled runs against deployed env   │
│       └── classify.spec.ts      catches cross-repo drift             │
└──────────────────────────────────────────────────────────────────────┘
```

### What Changes in Multi-Repo

| Concern | Mono-repo (us now) | Multi-repo (real org) |
|---|---|---|
| CI gate trigger | Every PR (all code together) | PR to the UI repo only |
| Backend regression detection | Same pipeline catches it | Synthetic monitoring catches it (backend repo has no Lighthouse) |
| Owner tag routing | Informational | Actionable — Slack routes to the right team's channel |
| Cross-repo pipeline trigger | Not needed | Backend PR triggers UI's Lighthouse suite via webhook |
| Threshold ownership | Single team decides | Negotiated between teams ("your SLA to us is 500ms") |

### The Key Insight

In a mono-repo, the CI gate catches everything because all code changes trigger all tests. In multi-repo, the CI gate only catches **UI regressions**. Backend regressions that surface in frontend metrics are invisible to the UI repo's pipeline — they only show up in synthetic monitoring.

That's why both patterns exist:
- **CI gate** lives in the app repo → catches regressions caused by that repo's changes
- **Synthetic monitoring** lives centrally → catches regressions caused by any repo's changes

The owner tags we're building now become critical in multi-repo: when synthetic monitoring detects that `result-displayed` INP regressed, the `owner: service-a` tag tells the platform team exactly which team to notify — without needing to know what changed or where.

---

## Relationship to Other Testing Layers

```
┌───────────────────────────────────────────────────────--─┐
│ Layer          │ Tool        │ What it catches           │
├────────────────┼─────────────┼──────────────────────────-┤
│ Contract shape │ Pact        │ Response structure drift  │
│ Backend perf   │ k6          │ HTTP latency regression   │
│ Frontend perf  │ Lighthouse  │ Render/paint regression   │
│ Functional     │ Playwright  │ "Does it work?"           │
│ Infra          │ BATS        │ K8s misconfiguration      │
│ Resilience     │ Chaos       │ Failure recovery          │
│ AI quality     │ LLMOps      │ Classification accuracy   │
└────────────────┴─────────────┴──────────────────────────-┘
```

Lighthouse fills the gap between "backend responded fast" (k6) and "the page works" (Playwright). It answers: "did the user **see** the result quickly and without jank?"
