# Platform Quality Lab — Project Rules

## Project Purpose
Learning project for SDET/platform quality engineering. Build microservices, deploy on Kubernetes, break things intentionally, encode learnings into CI guardrails.

## Project Mindset
Treat this as a real service in a large org. Production-grade tooling and patterns — services are intentionally trivial, the infrastructure around them is not. Never dismiss a tool as "overkill" — if it's used in real orgs, it belongs here.

## Hard Rules — Non-Negotiable

1. **Never run `record-deployment`, `publish`, or `can-i-deploy` from the terminal.** CI-only. Local Pact commands: `npm run test:pact` and `npm run test:pact:verify` only.
2. **Never record deployments from feature branches.** `record-deployment` only on main after real deployment.
3. **Never modify reusable scripts for project-specific quirks.** Fixes belong in docs, not in the script.
4. **The pipeline owns the Pact lifecycle.** All state (versions, deployments, verification) created by CI only.

## Tech Stack
- TypeScript / Node.js (Express)
- React + Vite + Tailwind (UI)
- Docker (multi-stage, alpine, non-root)
- Kind (Kubernetes in Docker)
- GitHub Actions

## Architecture

| Service | Port | Role |
|---------|------|------|
| Service A | 3000 | Gateway — calls B (`/info`) and C (`/classify`) |
| Service B | 3001 | Downstream data service |
| Service C | 3002 | LLM text classification (Ollama in CI, mock locally) |
| UI | 5173 | React frontend — calls Service A |

Each service: `app.ts` (pure Express) + `server.ts` (entrypoint). Tests import `app.ts` directly.

UI: `services/ui/` — Vite + React + Tailwind. API client layer in `src/api/` (Pact tests this). Shared UI components in `src/components/ui/`. Styles in `src/index.css` using `@apply`.

## Phased Plan
- **Phase 1–5** ✅ Scaffold, deploy, CI, chaos, guardrails
- **Phase 6** ✅ AI service, Pact evolution, k6 load testing, Slack notifications, dashboard
- **Phase 7** ✅ LLMOps — golden sets, accuracy thresholds, consistency tests (MR 3 deferred: dashboard trends after 10+ main runs)
- **Phase 8** ✅ API collections (Bruno — exploratory testing, environment management)
- **Phase 9** 🔄 UI + frontend quality
- **Phase 10** 🔜 Production deployment (Raspberry Pi, k3s, Cloudflare Tunnel)

## Current Phase: 9 — UI + Frontend Quality
Plan: `docs/roadmap/phase9-ui-frontend-quality.md`

### Phase 9 Status
- [x] MR 1 — React UI scaffold + mock mode + deploy scripts
- [ ] MR 2 — Frontend Pact consumer (UI → Service A `/classify` contract)
- [ ] MR 3 — Playwright E2E (happy path, error states)
- [ ] MR 4 — Lighthouse CI (Core Web Vitals budgets)
- [ ] MR 5 — k6 browser + frontend chaos

## Commands

### Dev
- `npm run dev` — start all services (A, B, C in mock mode, UI) + opens browser
- `npm run stop` — kill all services
- `./scripts/deploy-local.sh` — full Kind deploy
- `kind delete cluster --name platform-lab` — tear down

### Testing
- `npm run test:pact` — consumer contract tests
- `npm run test:pact:verify` — provider verification
- `npm run test:integration` — service endpoint tests
- `npm run test:infra` — K8s infrastructure tests (BATS)
- `npm run test:load:smoke` — k6 smoke (30s)
- `npm run test:load:regression` — k6 regression (3.5 min)
- `npm run test:load:load` — k6 load (5 min)
- `npm run test:load:stress` — k6 stress (find breaking points)
- `npm run test:load:analyze` — compare against baseline
- `npm run validate:manifests` — K8s manifest policy
- `npm run lint` — ESLint + resilience rules

### Chaos
- `./scripts/chaos/pod-kill.sh <service>`
- `./scripts/chaos/resource-pressure.sh <service> <cpu|mem|all>`
- `./scripts/chaos/dependency-failure.sh`
- `./scripts/chaos/latency-injection.sh`

## Key Decisions
- 2 replicas per service — rolling restarts + availability
- Resource limits tight (50m/64Mi req, 200m/128Mi limit) — triggers pressure in chaos
- All outbound HTTP calls must have timeouts
- `imagePullPolicy: Never` — Kind uses pre-loaded images
- Deploy order: B first, then A (A depends on B)
- Ollama runs on CI host, not in Kind (disk space)
- `LLM_MOCK=true` for local dev — Service C returns keyword-based canned responses
- LLM temperature 0 — deterministic classification (no randomness)
- Few-shot examples in system prompt — teaches model category boundaries
- `PACT_ENABLED` repo variable for break-glass (commit message flags don't work on PR merges)
- Pipeline: verification and deployment recording in separate stages
- k6: native TypeScript, 3-layer architecture, 10% regression threshold
- Slack webhooks for alerts (no bot framework)
- GitHub Pages dashboard (artifact-as-database pattern)
- UI: Vite proxy handles CORS locally, all fetch goes through `/api` prefix
- UI styles: Tailwind utilities extracted to `index.css` via `@apply`, components use semantic class names

## Pact
- PactFlow (SaaS) broker, token auth
- Environments: dev → qa → prod (main only)
- Feature branches: test + publish + verify only
- `failIfNoPactsFound: false`, `enablePending: true`
- UI is a Pact consumer of Service A — catches response shape drift at build time without needing services running
- Full docs: `docs/pact/`

## Test Structure
Test directories follow this layout — test files contain only assertions, helpers live in `utils/`, test data in `fixtures/`:
```
tests/<domain>/
├── utils/       ← API clients, loaders, result aggregation
├── fixtures/    ← test data (golden sets, payloads)
├── results/     ← generated output (gitignored)
└── *.test.ts    ← assertions only
```

## Coding Style
- Follow `docs/typescript-style-guide.md` for all TypeScript code
- Production-grade patterns, simple services
- K8s manifests: resource limits, readiness probes, liveness probes
- Dockerfiles: multi-stage, alpine, non-root
- No privileged containers

## Future Improvements
- App factory pattern (config as parameter, not env vars at module level)
- Zod config for all services (currently only Service C)
- Package extraction after Phase 7 (`@joxkalna/platform-quality-utils`)
- Refactor `scripts/notify/` — all scripts use top-level procedural code. Extract into callable functions (testable, composable) with a thin CLI entry point
- Consistent `Promise<void>` removal across all services (see typescript-style-guide.md)

## Reference Docs
- `docs/phase6-reference.md` — Phase 6 implementation details
- `docs/testing/chaos-log.md` — Phase 4 chaos experiment log
- `docs/pact/` — all Pact documentation
- `docs/performance/k6-load-testing.md` — k6 architecture and patterns
- `docs/llmops/phase7-plan.md` — Phase 7 implementation plan
- `docs/llmops/LLM-general-notes.md` — LLM patterns (agents, routing, parallelization)
- `docs/roadmap/phase9-ui-frontend-quality.md` — Phase 9 plan
- `bruno-collection/README.md` — Bruno API collection docs
