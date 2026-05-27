# Phase 11: Production Hardening

Consolidate tooling, enforce consistency, and close gaps that separate "works on my machine" from "runs in production with confidence." This phase produces no new features — it upgrades the engineering standards to match what's expected in a production-grade monorepo.

---

## Why Now

Phases 1–9 built breadth (services, tests, chaos, LLMOps, UI). The codebase grew organically — each phase introduced its own conventions. Before Phase 10 (production deployment), the foundation needs to be solid:

- No formatter → style drift across test domains
- Loose tsconfig → type bugs slip through
- No shared test config → inconsistent reporting, no coverage gates
- Happy-path-only integration tests → false confidence
- Silent config failures → runtime crashes in production

This phase fixes all of that.

---

## Scope

| Area | Current State | Target State |
|------|--------------|--------------|
| Formatting | None | Biome (format + lint + import sorting) |
| TypeScript | 3 duplicate loose tsconfigs | Shared strict base, services extend |
| Vitest | 6 standalone configs, no shared base | Base config with JUnit, coverage thresholds |
| Integration tests | 2 happy-path GETs per service | Error paths, validation, timeout behaviour |
| Service config | `process.env.X \|\| ""` (A, B) | Zod validation, fail-fast on missing config |
| Logging | `console.log` | Structured JSON (pino), correlation IDs |
| Shutdown | None | Graceful SIGTERM handling, connection draining |
| Request tracing | None | Request ID propagation across service chain |

---

## MR Breakdown

### MR 1 — Biome + Format Enforcement

Add Biome as the single tool for formatting, linting, and import organisation.

**What changes:**
- Add `biome.jsonc` at root
- Configure: single quotes, no semicolons, space indent, trailing commas ES5
- Enable `organizeImports` with grouped ordering (node → npm → local)
- Linter rules:
  - `noExplicitAny: error`
  - `useImportType: error` (separated type imports)
  - `noUnusedImports: error`
  - `noUnusedVariables: error`
  - `noParameterAssign: error`
  - `useAwait: error`
  - `noInferrableTypes: error`
- Override for test files: relax `noExplicitAny`
- Add `lint` script: `biome check --write .`
- Add `lint:ci` script: `biome ci .`
- Keep custom ESLint resilience plugin as a separate pass (Biome can't do custom AST rules)
- Run formatter across entire codebase — one big commit, then enforce going forward
- Update CI to run `biome ci .` instead of current ESLint-only check

**Why Biome over ESLint + Prettier:**
- Single tool replaces two (faster CI, simpler config)
- Handles formatting + linting + import sorting in one pass
- Sub-second execution on the full codebase
- Modern repos are converging on it

---

### MR 2 — Shared tsconfig Base

Create a strict base TypeScript config that all services and test directories extend.

**What changes:**
- Create `tsconfig.base.json` at root:
  ```jsonc
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "NodeNext",
      "moduleResolution": "NodeNext",
      "strict": true,
      "exactOptionalPropertyTypes": true,
      "verbatimModuleSyntax": true,
      "noUncheckedIndexedAccess": true,
      "noFallthroughCasesInSwitch": true,
      "forceConsistentCasingInFileNames": true,
      "skipLibCheck": true,
      "esModuleInterop": true
    }
  }
  ```
- Each service tsconfig: `"extends": "../../tsconfig.base.json"` + only service-specific overrides (`outDir`, `rootDir`)
- Each test tsconfig: `"extends": "../../tsconfig.base.json"` + test-specific overrides
- Fix all type errors surfaced by stricter config (this will be the bulk of the work)
- Migrate services from CommonJS to ESM (`"module": "NodeNext"`)

**Key flags explained:**
- `exactOptionalPropertyTypes` — distinguishes `undefined` from missing (catches real bugs)
- `verbatimModuleSyntax` — enforces `import type` for type-only imports
- `noUncheckedIndexedAccess` — array/object index returns `T | undefined` (prevents runtime crashes)

---

### MR 3 — Vitest Base Config + Coverage Thresholds

Create a shared vitest base that all test domains extend.

**What changes:**
- Create `vitest.base.ts` at root:
  ```ts
  import { defineConfig } from 'vitest/config'

  export default defineConfig({
    test: {
      globals: true,
      reporters: process.env.CI
        ? ['default', ['junit', { outputFile: './test-results/junit.xml' }]]
        : ['default'],
      coverage: {
        provider: 'istanbul',
        reporter: ['text', 'cobertura'],
        thresholds: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
  })
  ```
- Each test vitest config: `mergeConfig(baseConfig, defineConfig({ ... }))`
- Standardise on globals (remove explicit `import { describe, it, expect } from 'vitest'` everywhere)
- Add `vitest/globals` to tsconfig types
- JUnit output consumed by CI for trend tracking and failure attribution

---

### MR 4 — Zod Config for All Services

Every service validates its config at startup and crashes immediately if anything is missing.

**What changes:**
- Service A: Add Zod schema for `PORT`, `SERVICE_B_URL`, `SERVICE_C_URL`
- Service B: Add Zod schema for `PORT`
- Extract shared config pattern:
  ```ts
  import { z } from 'zod'

  const ConfigSchema = z.object({
    port: z.coerce.number().default(3000),
    serviceBUrl: z.string().url('SERVICE_B_URL must be a valid URL'),
    serviceCUrl: z.string().url('SERVICE_C_URL must be a valid URL'),
  })

  export const loadConfig = () => ConfigSchema.parse({
    port: process.env.PORT,
    serviceBUrl: process.env.SERVICE_B_URL,
    serviceCUrl: process.env.SERVICE_C_URL,
  })
  ```
- Service C already has Zod — no changes needed
- `app.ts` receives config as parameter (app factory pattern) instead of reading env vars at module level
- Tests pass config directly — no env var manipulation needed

**Why app factory:**
- Testable without env var side effects
- Config validated once at startup, passed through
- Aligns with the "future improvements" note in project rules

---

### MR 5 — Integration Test Depth

Expand integration tests from happy-path-only to production-grade coverage.

**What changes:**
- Add error path tests:
  - `POST /classify` with missing body → 400
  - `POST /classify` with non-string text → 400
  - `GET /data` when Service B is unreachable → 502
  - `GET /ready` when Service B is down → 503
- Add timeout behaviour tests:
  - Verify Service A returns 502 within reasonable time when downstream hangs
- Add config validation for test environment:
  ```ts
  const isCI = process.env.CI === 'true'

  const getRequiredUrl = (envVar: string, fallback: string): string => {
    const value = process.env[envVar]
    if (isCI && !value) throw new Error(`${envVar} required in CI`)
    return value || fallback
  }
  ```
- Add JUnit reporter to integration vitest config (via base config from MR 3)
- Add `afterEach` cleanup pattern for any stateful tests added later

---

### MR 6 — Structured Logging + Request ID Propagation

Replace `console.log` with structured JSON logging and trace requests across the service chain.

**What changes:**
- Add pino as logger for all services
- Log format: JSON with `timestamp`, `level`, `service`, `requestId`, `msg`
- Middleware that:
  - Reads `x-request-id` header from incoming request (or generates UUID)
  - Attaches to request context
  - Passes to downstream calls as header
  - Includes in all log lines for that request
- Request chain becomes traceable:
  ```
  UI → Service A (x-request-id: abc) → Service B (x-request-id: abc)
                                      → Service C (x-request-id: abc)
  ```
- In Kind: logs visible via `kubectl logs` with JSON parsing
- No log aggregation needed yet (Phase 10 can add that with the Pi deployment)

---

### MR 7 — Graceful Shutdown + Readiness Improvements

Ensure services handle SIGTERM correctly and readiness probes reflect actual capability.

**What changes:**
- `server.ts` for each service:
  ```ts
  const server = app.listen(config.port)

  const shutdown = () => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(1), 10_000) // force kill after 10s
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
  ```
- Service A `/ready` checks both B and C (currently only checks B)
- Add connection draining: stop accepting new connections on SIGTERM, finish in-flight requests
- K8s manifest: `terminationGracePeriodSeconds: 30` (already default, but make explicit)
- Verify with chaos: `pod-kill.sh` should show zero dropped requests during rolling restart

---

### MR 8 — Playwright Hardening

Production-grade Playwright config and test resilience.

**What changes:**
- Add `forbidOnly: !!process.env.CI` — prevents `.only` reaching main branch
- Add `trace: 'retain-on-failure'` — downloadable trace for CI debugging
- Add webkit project (minimum 2 browsers for prod confidence):
  ```ts
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ]
  ```
- Add MSW for UI component tests (decouple from running services):
  - `setup-tests.ts`: `beforeAll(() => server.listen())`, `afterEach(() => server.resetHandlers())`, `afterAll(() => server.close())`
  - Mock Service A responses at network level
  - Component tests run without any backend

---

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Biome over ESLint + Prettier | Single tool, faster, handles formatting + linting + imports. Keep ESLint only for custom resilience rules. |
| Strict tsconfig flags | Catches real bugs at compile time. The pain of fixing type errors now prevents runtime crashes later. |
| Coverage thresholds at 80% | High enough to prevent erosion, low enough to not incentivise meaningless tests. |
| App factory pattern | Config as parameter, not env vars at module level. Makes services testable and config explicit. |
| Pino for logging | JSON output, fast, minimal API. Works with K8s log collection out of the box. |
| Request ID as middleware | Cross-cutting concern, shouldn't pollute business logic. Middleware adds/reads it transparently. |
| MSW for UI tests | Frontend tests must not depend on backend availability. Network-level mocking is the standard. |

---

## Success Criteria

Phase 11 is complete when:

- [ ] `biome ci .` passes on every push (no formatting or lint violations)
- [ ] `tsc --noEmit` passes with strict base config across all services
- [ ] All vitest suites output JUnit XML in CI
- [ ] Coverage thresholds enforced (80% branches/functions/lines)
- [ ] Every service crashes on startup with invalid config (Zod validation)
- [ ] Integration tests cover error paths (400, 502, 503, timeout)
- [ ] All logs are structured JSON with request IDs
- [ ] `kubectl logs` shows correlated request traces across A → B → C
- [ ] Services handle SIGTERM gracefully (zero dropped requests during rolling restart)
- [ ] Playwright runs on 2 browsers with traces retained on failure
- [ ] UI component tests run without backend services (MSW)

---

## Prerequisites

- Phase 9 complete (UI deployed, Playwright and k6 browser in place)
- All existing CI gates still pass after each MR

---

## Relationship to Phase 10

Phase 10 (production deployment) depends on Phase 11. You don't deploy to production without:
- Strict types catching bugs before runtime
- Structured logs for debugging without SSH access
- Graceful shutdown for zero-downtime deploys
- Config validation preventing misconfigured services from starting

Phase 11 makes the codebase production-ready. Phase 10 puts it in production.
