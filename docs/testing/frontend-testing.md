# Frontend Testing Strategy

How we test the UI — three distinct layers, each answering a different question.

---

## The Layers

| Layer | Tool | Speed | Needs services? | Question it answers |
|-------|------|-------|-----------------|---------------------|
| Component | Vitest + React Testing Library | ~1s | No | Does the UI behave correctly given known inputs? |
| E2E | Playwright | ~10-30s | Yes (full stack) | Does the whole system work together? |
| Contract | Pact | ~2s | No | Will a backend change break the UI? |

```
┌─────────────────────────────────────────────────────┐
│  E2E (Playwright)                                   │
│  Real browser → Vite → Service A → Service C → LLM │
│  Proves the full chain works                        │
├─────────────────────────────────────────────────────┤
│  Component (Vitest + RTL)                           │
│  jsdom render → mock API → assert DOM state         │
│  Proves UI logic is correct                         │
├─────────────────────────────────────────────────────┤
│  Contract (Pact)                                    │
│  API client → mock server → verify shape            │
│  Proves UI won't break on deploy                    │
└─────────────────────────────────────────────────────┘
```

---

## Component Tests

**Location:** `services/ui/src/components/**/*.test.tsx`

**What they test:**
- Button disabled when input is empty
- Loading state shows during API call
- Error message renders on failure
- Result clears when input is emptied
- Example chips populate the textarea

**How they work:**
- Render the React component in jsdom (no browser)
- Mock the API client (`vi.mock`) — no network calls
- Simulate user interactions (`userEvent.type`, `userEvent.click`)
- Assert on DOM state (`toBeDisabled`, `toBeInTheDocument`)

**When to write one:**
- Testing UI logic (conditional rendering, state transitions)
- Testing user interactions (click, type, clear)
- Testing error/loading/empty states
- Any test where the answer depends on the component, not the backend

**When NOT to write one:**
- Testing that the backend returns the right data (that's integration/E2E)
- Testing visual appearance (that's Storybook or visual regression)
- Testing browser-specific behaviour (that's Playwright)

```bash
npm run test:component   # runs in <2s, no services needed
```

---

## E2E Tests

**Location:** `tests/e2e/*.spec.ts`

**What they test:**
- User types text → clicks classify → sees real result from the LLM
- The full request chain: browser → Vite proxy → Service A → Service C → Ollama

**How they work:**
- Playwright launches a real Chromium browser
- Navigates to the running UI (Vite dev server)
- Interacts like a real user
- Asserts on real responses from real services

**When to write one:**
- Proving the full stack works end-to-end
- Smoke tests after deployment
- Testing behaviour that depends on real backend responses

**When NOT to write one:**
- Testing UI states you can trigger with a mock (use component tests)
- Testing every error permutation (mock it in component tests)
- Testing performance (use k6 browser)

```bash
npm run test:e2e   # needs services running (npm run dev or Kind cluster)
```

---

## Component vs E2E — Decision Guide

| Scenario | Use |
|----------|-----|
| Button disabled when input empty | Component |
| Loading spinner shows during request | Component |
| Error message on 503 | Component |
| Classify returns real category from LLM | E2E |
| Full user journey works after deploy | E2E |
| Chip click populates textarea | Component |
| Response renders with correct formatting | Component |

**Rule of thumb:** If you need to mock `page.route` or the API client to test it, it's a component test. If you need real services running, it's E2E.

---

## Where Does Storybook Fit?

Storybook is for **component libraries** — reusable UI primitives (Button, Badge, DataField) that need:
- Visual documentation (designers browse variants)
- Visual regression testing (screenshot diffing)
- Interaction tests on isolated components (`play` functions)

**We don't use Storybook here because:**
- The UI is a single-page app, not a component library
- We have one consumer of these components (the Classify page)
- Component tests with Vitest + RTL cover the same behavioural assertions faster
- No design team browsing a component catalogue

**When Storybook makes sense:**
- Shared component library consumed by multiple apps
- Design system with documented variants/states
- Visual regression testing (Chromatic, Percy)
- Designers need a living style guide

---

## CI Pipeline Placement

```
install → lint ──────────────┐
        → typecheck ─────────┤  ← component tests run here (fast, no infra)
        → validate-k8s ──────┤
        → pact ───────────────┴→ deploy-and-test
                                   ├── BATS infra tests
                                   ├── Vitest integration tests
                                   ├── k6 smoke test
                                   ├── Playwright E2E  ← runs here (needs services)
                                   ├── LLMOps evaluation
                                   └── ...
```

- **Component tests** gate the pipeline early (parallel with lint/typecheck) — if UI logic is broken, fail fast
- **E2E tests** run after deploy — they need the full stack in Kind
- **Contract tests** (Pact) run in the pact job — they need neither browser nor services

---

## Running Locally

```bash
# Component tests — no services needed
npm run test:component

# Contract tests (Pact) — no services needed
npm run test:pact

# E2E tests — needs services running
npm run dev              # start all services + UI
npm run test:e2e         # run Playwright against localhost:5173

# E2E with Playwright UI (interactive debugging)
npm run test:e2e:ui
```

## How They Relate

```
Does the UI render correctly?          → Component test (Vitest + RTL)
Will a backend change break the UI?    → Contract test (Pact)
Does the full system work together?    → E2E test (Playwright)
```

All three can catch a bug where Service A renames `classification` to `result`:
- Component test: won't catch it (API is mocked)
- Pact: catches it at build time, blocks deploy via can-i-deploy
- E2E: catches it at deploy time, after services are running

Pact is the fastest feedback loop for API shape changes — it runs without services and fails in seconds. E2E is the last line of defence.
