# Phase 9: UI + Frontend Quality

A minimal React UI for Service C's `/classify` endpoint — intentionally simple (like the backend services) because the focus is on the quality engineering around it, not the UI itself.

---

## Why a UI

Adding a frontend creates a new service boundary and a full request chain worth testing:

```
UI (browser) → Service A /classify → Service C → LLM
```

This is a 4-hop chain. The UI adds testing dimensions that don't exist with backend-only services:

| Dimension | What's new | Tool |
|-----------|-----------|------|
| Frontend contract testing | UI expects `{ source, classification: { category, confidence } }` from Service A | Pact (new consumer) |
| Frontend performance | Core Web Vitals, Largest Contentful Paint, Time to Interactive | Lighthouse CI |
| Browser-based load testing | Can the UI handle N concurrent users without degrading? | k6 browser module |
| E2E user flows | Type text → click classify → see result → assert on output | Playwright |
| Frontend chaos | What happens to the UI when Service A is slow or down? | Chaos scripts + Playwright assertions |

Without the UI, all testing is API-level. With it, you test the full user experience — browser rendering + API latency + backend processing combined.

---

## The UI

Minimal React app. One page:
- Text input
- "Classify" button
- Result display (category + confidence)
- Error state when Service A is unreachable

Deployed as a container in Kind (nginx serving static files) alongside the existing services. Same patterns: Dockerfile (multi-stage, alpine, non-root), K8s manifest (replicas, resource limits, probes), `imagePullPolicy: Never`.

```
services/
├── service-a/    Express (port 3000) → calls Service B + C
├── service-b/    Express (port 3001) → returns data
├── service-c/    Express (port 3002) → LLM text classification
└── ui/           React (port 8080)   → calls Service A /classify
```

The UI has an API client layer — a function that calls Service A and parses the response. This is the layer that Pact tests, not the React components.

---

## Frontend Contract Testing (Pact)

Same Pact you'd use between backend services — the consumer just happens to be a frontend app.

### Why it matters

Without the contract test, someone changes Service A's `/classify` response shape (renames `classification` to `result`) and:
- Service A's own tests pass ✅
- Service C's provider verification passes ✅
- The UI breaks silently ❌

With the contract test, `can-i-deploy` blocks the Service A change because the UI consumer still depends on the old shape. Same pattern as the `priority` and `severity` exercises in Phase 6.

### How it works

The UI's Pact consumer test doesn't need a browser. It tests the **API client layer** — the function that calls `/classify` and parses the response:

```typescript
// ui pact consumer test — no browser, no React, just the API call
await provider.addInteraction({
  uponReceiving: 'a classify request',
  withRequest: {
    method: 'POST',
    path: '/classify',
    body: { text: 'some input' }
  },
  willRespondWith: {
    status: 200,
    body: {
      source: MatchersV3.string('service-a'),
      classification: {
        category: MatchersV3.string(),
        confidence: MatchersV3.number()
      }
    }
  }
})

// call the real API client function against the mock server
const result = await classifyText(mockServer.url, 'some input')
expect(result.classification.category).toBeDefined()
```

This is one of the most common Pact use cases in large orgs — frontend teams write consumer pacts against backend APIs so that backend changes can't break the UI without `can-i-deploy` catching it first.

### Contract map after Phase 9

```
UI (consumer)        → Service A (provider)    — POST /classify
Service A (consumer) → Service B (provider)    — GET /info
Service A (consumer) → Service C (provider)    — POST /classify
```

Three consumers, two providers. `can-i-deploy` checks all of them before any service deploys.

---

## Lighthouse CI

Automated Core Web Vitals assertions in CI. Lighthouse runs a real browser against the deployed UI and measures:

- Largest Contentful Paint (LCP)
- Cumulative Layout Shift (CLS)
- Time to Interactive (TTI)
- First Contentful Paint (FCP)

### CI integration

Lighthouse CI runs after the UI is deployed to Kind, same as integration tests:

1. Port-forward the UI service to localhost
2. Run Lighthouse CI against `http://localhost:8080`
3. Assert thresholds (e.g. LCP < 2.5s, CLS < 0.1)
4. Upload report as GitHub Actions artifact

### What it teaches

- Frontend performance budgets as CI gates
- How backend latency (Service A → C → LLM) affects frontend metrics
- The difference between synthetic (Lighthouse) and real user (k6 browser) performance testing

---

## k6 Browser Module

k6 added browser-based testing (`import { browser } from 'k6/experimental/browser'`) which runs real Chromium sessions alongside HTTP load. This is where frontend performance under load gets tested.

### What it answers

- Can the UI render correctly while the backend is under HTTP load?
- Do Core Web Vitals degrade when 10 concurrent users are classifying text?
- What's the end-to-end latency from button click to result display under load?

### How it fits with existing k6

The existing k6 framework (Phase 6) tests HTTP endpoints. k6 browser adds a new scenario type that runs a real browser:

```typescript
// browser scenario — runs alongside HTTP scenarios
export async function classifyFlow() {
  const page = browser.newPage()
  await page.goto('http://localhost:8080')
  await page.fill('#text-input', 'some text to classify')
  await page.click('#classify-button')
  await page.waitForSelector('#result')

  check(page, {
    'result displayed': p => p.locator('#result').isVisible(),
  })

  page.close()
}
```

This runs in the same k6 test as HTTP scenarios — you can have HTTP load on Service A while browser users interact with the UI, measuring both simultaneously.

---

## Playwright E2E

Playwright tests the UI's functional correctness — not performance, not contracts, just "does it work?"

### Scope

- Type text → click classify → result appears with category and confidence
- Error state: Service A unreachable → UI shows error message
- Loading state: slow response → UI shows loading indicator
- Empty input: validation prevents submission

### How it differs from k6 browser

| | Playwright | k6 browser |
|---|---|---|
| Purpose | Functional correctness | Performance under load |
| Concurrency | Single user | Multiple concurrent users |
| Assertions | DOM state, text content | Metrics (latency, errors, Web Vitals) |
| When it runs | Every push | Main branch / on-demand |

Both use a real browser. Playwright answers "does it work?" — k6 browser answers "does it work under load?"

---

## Frontend Chaos

What happens to the UI when the backend degrades? This extends the existing chaos experiments to include frontend assertions:

| Experiment | Backend effect | Frontend assertion |
|-----------|---------------|-------------------|
| Service A pod kill | 503 for ~5s until K8s recovers | UI shows error, retries, recovers |
| Service C latency injection | `/classify` takes 10s+ | UI shows loading state, doesn't hang |
| Service A dependency failure | Service C scaled to 0 | UI shows meaningful error, not blank page |

Playwright runs the assertions — it's already interacting with the UI, so adding chaos assertions is just "start chaos script → check UI state → wait for recovery → check UI state again."

---

## MR Breakdown

### MR 1 — UI scaffold + deploy to Kind
- Minimal React app (text input, classify button, result display)
- Dockerfile (multi-stage: build with node, serve with nginx)
- K8s manifest (2 replicas, resource limits, probes)
- API client layer (separate from React components — testable without browser)
- Deploy script updated for UI service
- README updated with UI endpoint

### MR 2 — Frontend Pact consumer
- Pact consumer test for UI → Service A `/classify`
- Service A becomes a provider for two consumers (Service A's existing consumer tests + UI)
- `can-i-deploy.sh` updated for 4 services
- Provider verification for Service A updated (verifies against both consumers)

### MR 3 — Playwright E2E
- Playwright test suite (happy path, error states, loading states)
- CI integration (runs after deploy, before chaos)
- Playwright installed in CI job

### MR 4 — Lighthouse CI
- Lighthouse CI config with performance budgets
- CI integration (runs after deploy)
- Report uploaded as GitHub Actions artifact
- Thresholds: LCP < 2.5s, CLS < 0.1, TTI < 3s

### MR 5 — k6 browser + frontend chaos
- k6 browser scenario for classify flow
- Combined HTTP + browser load profile
- Chaos experiments extended with Playwright frontend assertions
- CI integration (main branch only, after existing chaos)

---

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Minimal React app | UI is intentionally trivial — focus is on quality engineering, not frontend development |
| nginx container in Kind | Same deployment pattern as backend services — Dockerfile, K8s manifest, probes |
| API client layer separate from React | Pact tests the API client, not the components — no browser needed for contract tests |
| Playwright over Cypress | Playwright has better multi-browser support, faster execution, and native async/await |
| k6 browser over standalone browser perf tool | Reuses existing k6 framework, runs browser + HTTP scenarios together |
| Lighthouse CI for synthetic budgets | Industry standard for Core Web Vitals gates — complements k6 browser (synthetic vs load) |

---

## Prerequisites

Phase 9 depends on:
- Phase 6 complete (Service C deployed, k6 framework in place)
- Phase 7 complete (LLMOps — golden sets give meaningful classify responses to test against)
- Phase 8 complete (Bruno — API collections establish the API surface the UI consumes)

The UI is the capstone — it ties frontend + backend performance together and exercises every quality layer built in previous phases.
