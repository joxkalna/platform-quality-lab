# k6 Browser Testing

Frontend performance under load — runs real Chromium sessions alongside HTTP scenarios.

## Why

Lighthouse answers: "Is the page fast for a single user?"
k6 browser answers: "Is the page fast when the backend is under load?"

A page can score 100 on Lighthouse but degrade badly when 10 users hit the API simultaneously. k6 browser catches this by running real browser sessions while HTTP scenarios generate backend pressure.

## How It Works

k6's [browser module](https://grafana.com/docs/k6/latest/using-k6-browser/) launches Chromium instances as part of a k6 test. Browser scenarios run alongside HTTP scenarios in the same test execution.

```
┌─────────────────────────────────────────────────┐
│ k6 test execution                               │
├─────────────────────────────────────────────────┤
│ HTTP scenario: 3 req/s against /data            │
│ Browser scenario: 2 VUs running classify flow   │
└─────────────────────────────────────────────────┘
```

The browser scenario:
1. Navigates to the UI
2. Types text into the classify input
3. Clicks "Classify"
4. Waits for the result
5. Asserts functional correctness + measures timing

## Architecture

Browser scenarios follow the same 3-layer pattern as HTTP tests:

```
tests/load/src/
├── scenarios/
│   ├── classify-browser-scn.ts    ← browser journey (this MR)
│   ├── health-check-scn.ts        ← HTTP scenario
│   ├── data-flow-scn.ts           ← HTTP scenario
│   └── full-journey-scn.ts        ← HTTP scenario
├── config/
│   └── browser-test.json          ← combined HTTP + browser profile
└── index.ts                       ← exports all scenarios
```

### Adding a New Browser Journey

1. Create `scenarios/<name>-browser-scn.ts` — async function, owns its page lifecycle
2. Define custom `Trend` metrics prefixed with `browser_<name>_`
3. Export from `index.ts`
4. Add a scenario entry in a JSON config with `options.browser.type: "chromium"`
5. Add thresholds for the new metrics in the same config

### Multi-Service Growth

When more UIs exist (e.g. admin panel, customer portal), each gets its own browser scenario file. The JSON config composes them:

```json
{
  "scenarios": {
    "http-backend-load": { "exec": "dataFlow", "..." : "..." },
    "browser-classify": { "exec": "classifyBrowser", "..." : "..." },
    "browser-admin": { "exec": "adminBrowser", "..." : "..." },
    "browser-ai": { "exec": "aiBrowser", "..." : "..." }
  }
}
```

Each scenario is independent — different VU counts, different thresholds, different URLs. The JSON config is the composition layer.

### Multi-Team Ownership

Custom metrics carry ownership implicitly:

| Metric | Owner | Why |
|--------|-------|-----|
| `browser_classify_duration` | UI team + Service A team | Full round-trip through UI → A → C |
| `browser_page_load_duration` | UI team | Static asset delivery |
| `http_req_duration{scenario:data-flow}` | Service A + B teams | Backend latency |

Threshold breaches in CI tell you which team's domain degraded. Slack alerts can route to different channels per metric prefix.

## Custom Metrics

| Metric | What it measures |
|--------|-----------------|
| `browser_page_load_duration` | Time from navigation start to `networkidle` |
| `browser_classify_duration` | Time from button click to result visible |

## Thresholds

```json
{
  "browser_classify_duration": ["p(95)<30000"],
  "browser_page_load_duration": ["p(95)<5000"]
}
```

Lenient thresholds — Kind cluster in CI has no CDN, limited resources. Production would tighten.

## Running Locally

```bash
# Requires services running (npm run dev)
npm run test:load:browser
```

## CI Integration

Runs on main branch only, after chaos experiments. Non-blocking (`continue-on-error: true`) — provides data for trend analysis without gating merges.

## Relationship to Other Tools

| Tool | Question it answers | Concurrency |
|------|-------------------|-------------|
| Lighthouse | Is the page fast? (single user, synthetic) | 1 |
| k6 HTTP | Is the API fast under load? | Many |
| k6 browser | Is the page fast under load? | Few browsers + many HTTP |
| Playwright | Does the page work correctly? | 1 |
| Playwright chaos | Does the page handle failure correctly? | 1 + kubectl |

## Frontend Chaos (Playwright)

Separate from k6 browser — Playwright tests UI behaviour during backend failure:

| Experiment | What happens | UI assertion |
|-----------|-------------|-------------|
| Pod kill (Service A) | 503 until K8s recovers | Error shown → retry → success |
| Scale-down (Service C) | Downstream gone | Error shown → restore → success |

These run as Playwright tests (`tests/e2e/chaos.spec.ts`) using the existing `ClassifyPage` page object. They call `kubectl` directly to inject failure, then assert UI state.

### Adding New Chaos Assertions

1. Add a test case in `chaos.spec.ts`
2. Use `kubectl()` helper to inject failure
3. Assert UI shows appropriate error state
4. Restore the system
5. Assert recovery

The pattern is always: baseline → break → assert error → fix → assert recovery.

## References

- [k6 browser module docs](https://grafana.com/docs/k6/latest/using-k6-browser/)
- [k6 browser metrics](https://grafana.com/docs/k6/latest/using-k6-browser/metrics/)
- [Running browser tests](https://grafana.com/docs/k6/latest/using-k6-browser/running-browser-tests/)
- [k6 browser scenarios](https://grafana.com/docs/k6/latest/using-k6-browser/running-browser-tests/#browser-scenario-options)
- [PerformanceNavigationTiming API](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceNavigationTiming)
