# Lighthouse Service — Roadmap

A reusable performance testing engine that runs Lighthouse user flows, extracts metrics, and reports results. Currently lives in `tests/lighthouse/utils/runner.ts` — will be extracted into a shared package when repos split.

## What's Missing (Future MRs)

### Configuration & Flexibility

| Feature | Why | Priority |
|---|---|---|
| Warm navigation | Test subsequent page load with populated cache. Lighthouse calls this a ["warm navigation"](https://web.dev/articles/lighthouse-user-flows#navigation) — navigate once (cold), then navigate again (warm) to measure caching effectiveness. | High |
| Multiple iterations + median | Single runs are noisy. 3-5 runs with median gives stable CI gates. [Lighthouse recommends multiple runs](https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md) for reliable results. | High |
| Throttling profiles | Simulate slow CPU / network. Uses Lighthouse's [`settings.throttling`](https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md) to test how the UI performs on low-end devices. | Medium |
| Blocked resources | Run with/without third-party scripts to isolate their performance impact. Uses Lighthouse's [`settings.blockedUrlPatterns`](https://github.com/GoogleChrome/lighthouse/blob/main/docs/configuration.md). | Medium |
| Cookies / localStorage setup | Pre-set auth state, feature flags, consent banners before testing. Uses Puppeteer's [`browser.setCookie()`](https://pptr.dev/api/puppeteer.browser.setcookie). | Medium |
| Custom user agent | Identify test traffic in server logs. Avoid polluting analytics. Uses Lighthouse's [`settings.emulatedUserAgent`](https://github.com/GoogleChrome/lighthouse/blob/main/docs/configuration.md). | Low |

### Resilience & Debugging

| Feature | Why | Priority |
|---|---|---|
| Per-step timeout with abort | Prevent a single slow step from hanging the entire run. Fail fast. | High |
| Continue on failure | If step 2 of 5 fails, still measure steps 3-5. Partial data > no data. | High |
| Screenshot on element not found | Immediate visual debugging when a selector breaks. | Medium |
| Pre-warm request | Avoid cold-start penalties skewing the first navigation measurement. | Medium |
| Traces + console messages capture | Deep debugging — see exactly what the browser did during the test. | Low |

### Reporting & Integration

| Feature | Why | Priority |
|---|---|---|
| Structured result object with status per interaction | Know which steps passed/failed/skipped without parsing logs. | High |
| Configurable output (filesystem, API, custom handler) | Decouple the engine from where results go. | Medium |
| Threshold checking built into the engine | `compareThresholds()` returns breaches — consumer doesn't need to compare manually. | Medium |

---

## Implementation Plan

### Phase 9 — Follow-up hardening

Improve reliability of CI runs:

1. **Step timeouts** — prevent a single slow selector from hanging the entire run. Lighthouse's [`maxWaitForLoad`](https://github.com/GoogleChrome/lighthouse/blob/main/docs/configuration.md) handles navigation, but timespan steps need manual timeout wrapping.
2. **Partial results on failure** — if step 3 of 5 fails, still report metrics from steps 1-2. Partial data is better than no data for trend tracking.
3. **Screenshot capture** — on any selector failure, save a screenshot to results/ for debugging. Already partially implemented.

### Phase 9 — Before k6 browser (MR 5)

Add measurement modes that give richer data:

1. **Warm navigation** — Lighthouse supports measuring [subsequent navigations](https://web.dev/articles/lighthouse-user-flows#navigation) where the cache is already populated. Shows how much caching helps.
2. **Multiple iterations** — Lighthouse results have [known variability](https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md). Running 3+ times and taking the median reduces noise.
3. **Device simulation** — Lighthouse's [throttling](https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md) can simulate mobile CPU/network. Tests whether the UI is usable on low-end devices.

### Phase 10 — Service extraction

Extract into a deployable container (see below).

### Phase 10 — Package extraction

Extract into `@platform-quality/lighthouse-core` and deploy as a container on k3s (Raspberry Pi):

The engine becomes a service in the cluster — same deployment pattern as Service A, B, C. Accepts test requests via HTTP, runs Lighthouse, returns structured metrics. The same code that runs inline in CI today becomes a long-lived service that synthetic monitoring and other repos can call.

```
k3s cluster (Raspberry Pi)
├── service-a
├── service-b
├── service-c
├── ui
└── lighthouse-service    ← accepts config, runs Chrome, returns metrics
```

Features to add at extraction:

1. **Blocked resources** — accept patterns to block (analytics, ads, fonts). Uses Lighthouse's [`settings.blockedUrlPatterns`](https://github.com/GoogleChrome/lighthouse/blob/main/docs/configuration.md).
2. **Cookies / localStorage** — set before navigation. Uses Puppeteer's [`browser.setCookie()`](https://pptr.dev/api/puppeteer.browser.setcookie) and `page.evaluate()` for localStorage.
3. **Custom user agent** — append test identifier. Uses Lighthouse's [`settings.emulatedUserAgent`](https://github.com/GoogleChrome/lighthouse/blob/main/docs/configuration.md).
4. **Pre-warm** — fire a request before Lighthouse navigates to avoid cold-start penalties skewing the first measurement. Standard performance testing pattern.
5. **Traces + console capture** — write to results directory for deep debugging. Uses Lighthouse's [`flow.createArtifactsJson()`](https://web.dev/articles/lighthouse-user-flows) which exposes trace events and console messages per step.
6. **Configurable output handler** — filesystem by default, extensible for other targets.
7. **Built-in threshold checking** — `compareThresholds(results, budgets)` returns breach list.

---

## Architecture When Extracted

The package structure will be determined during Phase 10 based on what the runner has evolved into by then. The key principle: the engine is a pure Node package with no infrastructure opinions — it takes a config, runs Chrome + Lighthouse, returns metrics. Deployment wrappers (container, CLI, CI step) are separate.

---

## Key Decisions

| Decision | Rationale |
|---|---|
| INP via Lighthouse audit (`?? 0`) | INP is reported in timespans when a qualifying interaction occurs. Falls back to 0 for wait-only timespans. No need for PerformanceObserver. |
| No `@lhci/cli` | We need per-interaction measurement with owner tags. `@lhci/cli` is page-load only. |
| Lenient thresholds for Kind | CI runs in Docker with no CDN. LCP 10s / FCP 6s is realistic for this environment. Production would tighten. |
| Single iteration (for now) | Speed over accuracy in CI. Add iterations when flakiness becomes a problem. |
| Engine separate from flow definitions | Runner is generic (future package). Flows are app-specific (stay in each repo). |
| `?? 0` not `requireMetric` for INP | INP is only available when an interaction fires during the timespan. Timespans that just wait (e.g. for a network response) won't have INP — that's expected, not an error. |

---

## Relationship to Other Performance Tools

```
┌─────────────────────────────────────────────────────────────┐
│ Tool              │ Measures              │ When             │
├───────────────────┼───────────────────────┼──────────────────┤
│ Lighthouse engine │ Page load + user flow │ Every PR (gate)  │
│                   │ LCP, FCP, CLS, TBT,  │ Cron (synthetic) │
│                   │ INP per interaction   │                  │
├───────────────────┼───────────────────────┼──────────────────┤
│ k6 HTTP           │ Backend latency       │ Every PR         │
│                   │ p90, throughput, errs  │ Main (load test) │
├───────────────────┼───────────────────────┼──────────────────┤
│ k6 browser        │ Frontend under load   │ Main only        │
│ (Phase 9 MR 5)   │ Web Vitals + N users  │                  │
├───────────────────┼───────────────────────┼──────────────────┤
│ Playwright        │ Functional correctness│ Every PR         │
│                   │ "Does it work?"       │                  │
└───────────────────┴───────────────────────┴──────────────────┘
```

Lighthouse answers: "Is the page fast for a single user?"
k6 browser answers: "Is the page fast under load?"
Both are needed — they catch different failure modes.
