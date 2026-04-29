# Phase 7 — LLMOps Implementation Plan

Testing non-deterministic AI outputs with the same rigour as deterministic services.

Service C already exists (Phase 6). Phase 7 adds the quality engineering layers around it.

---

## What Phase 7 Adds

| Capability | What it does | CI gate? |
|-----------|-------------|----------|
| Golden set | Curated inputs with expected categories, run against `/classify` | Yes — accuracy threshold |
| Accuracy threshold | Pipeline fails if golden set pass rate drops below X% | Yes |
| Consistency tests | Same input N times, assert outputs don't drift | Yes — variance threshold |
| Evaluation pipeline | Run golden set → score → compare → gate/alert | Yes |
| Non-deterministic assertions | Semantic matching, range-based confidence, category-in-set | Foundation for all above |

---

## Architecture

```
tests/llmops/
├── fixtures/
│   ├── golden-set.json            # Curated input/expected-output pairs
│   └── edge-cases.json            # Known tricky inputs (ambiguous, adversarial)
├── evaluate.test.ts               # Golden set accuracy + per-category breakdown
├── consistency.test.ts            # Multi-run stability (same input → stable output)
├── vitest.config.mts              # Separate config (longer timeout, no coverage)
└── tsconfig.json
```

---

## Golden Set Design

Each entry defines an input and acceptable outputs:

```json
{
  "id": "gs-001",
  "input": "server is down and completely unresponsive",
  "expectedCategory": "critical",
  "acceptableCategories": ["critical"],
  "minConfidence": 0.6,
  "tags": ["obvious", "infrastructure"]
}
```

Categories for the golden set:
- **Obvious cases** — clear-cut inputs where the model should always get it right (baseline accuracy)
- **Ambiguous cases** — inputs that could reasonably be multiple categories (tests model reasoning)
- **Edge cases** — adversarial, empty, very long, non-English, prompt injection attempts

Golden set size: ~30–50 cases. Small enough to run in CI on every push, large enough to catch regressions.

---

## Assertion Patterns

### 1. Category accuracy (golden set)
```typescript
expect(validCategories).toContain(result.category)
expect(result.category).toBe(expected.expectedCategory)
// OR for ambiguous cases:
expect(expected.acceptableCategories).toContain(result.category)
```

### 2. Confidence bounds
```typescript
expect(result.confidence).toBeGreaterThanOrEqual(0)
expect(result.confidence).toBeLessThanOrEqual(1)
expect(result.confidence).toBeGreaterThanOrEqual(expected.minConfidence)
```

### 3. Consistency (multi-run)
```typescript
const results = await Promise.all(Array.from({ length: 5 }, () => classify(input)))
const categories = new Set(results.map(r => r.category))
expect(categories.size).toBe(1) // same category every time for obvious inputs
```

### 4. Structural validity
```typescript
expect(result).toHaveProperty('category')
expect(result).toHaveProperty('confidence')
expect(result).toHaveProperty('model')
expect(typeof result.category).toBe('string')
expect(typeof result.confidence).toBe('number')
```

---

## CI Integration

```
deploy-and-test:
  ├── ... existing steps ...
  ├── k6 smoke test
  ├── LLMOps evaluation (golden set + consistency)  ← NEW
  ├── k6 regression test
  ├── Chaos experiments
  └── Teardown
```

### When it runs
- **Every push:** Full golden set (30–50 cases, ~2–3 min with Ollama)
- **Accuracy gate:** Pipeline fails if accuracy < threshold (start at whatever first run produces, ratchet up)
- **Consistency gate:** Pipeline fails if variance exceeds threshold on obvious cases

### Why it runs on every push (not nightly)
The model is local (Ollama in CI). No API cost. The golden set is small. Running it on every push catches prompt regressions immediately — before merge, not after.

---

## Evaluation Output

After each run, produce a JSON result:

```json
{
  "timestamp": "2026-05-01T10:30:00Z",
  "branch": "main",
  "model": "llama3.2:1b",
  "totalCases": 40,
  "correct": 34,
  "accuracy": 0.85,
  "perCategory": {
    "critical": { "total": 10, "correct": 9, "accuracy": 0.9 },
    "warning": { "total": 10, "correct": 8, "accuracy": 0.8 },
    "info": { "total": 10, "correct": 9, "accuracy": 0.9 },
    "ok": { "total": 10, "correct": 8, "accuracy": 0.8 }
  },
  "consistency": {
    "casesChecked": 10,
    "stable": 9,
    "unstable": 1
  }
}
```

Upload as CI artifact. Append to trend file for dashboard (same pattern as k6).

---

## MR Breakdown

### MR 1 — Golden set + accuracy gate

- `tests/llmops/` directory with vitest config
- `fixtures/golden-set.json` — 30–50 curated cases
- `evaluate.test.ts` — runs golden set, asserts accuracy ≥ threshold
- CI: runs after smoke test, gates pipeline
- Produces `tests/llmops/results/evaluation.json`
- npm script: `test:llmops`

### MR 2 — Consistency tests

- `consistency.test.ts` — runs obvious cases 5x each, asserts stability
- Variance threshold for confidence scores
- Category agreement threshold (100% for obvious, relaxed for ambiguous)
- npm script: `test:llmops:consistency`

### MR 3 — Evaluation pipeline + dashboard integration

- Trend extraction script (same pattern as k6/chaos)
- Dashboard: accuracy trend over time, per-category breakdown
- Slack alert on accuracy regression
- Baseline file (`tests/llmops/baseline.json`) with ratchet pattern

---

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Vitest over standalone script | Same tooling as rest of project, same CI patterns, same reporting |
| Golden set in JSON fixtures | Version-controlled, reviewable, easy to extend |
| Run on every push | Ollama is local, no API cost, small set is fast |
| Separate vitest config | Longer timeout (LLM calls are slow), no coverage |
| Accuracy threshold starts low | Measure first, then ratchet — don't guess what the model can do |
| Per-category breakdown | Catches category-specific regressions that aggregate accuracy hides |
| Consistency only on obvious cases | Ambiguous inputs are expected to vary — don't penalise the model for being uncertain |
| Same dashboard pattern as k6 | Trend JSON + GitHub Pages — zero new infrastructure |

---

## Constraints

- Ollama with llama3.2:1b on CI (200m CPU, 128Mi memory in Kind — but Ollama runs on host)
- Response times will be 2–10s per classification
- 40 cases × ~5s = ~3.5 min for full golden set — acceptable for CI
- Consistency tests (10 cases × 5 runs × ~5s) = ~4 min — run in parallel where possible
- Total Phase 7 CI addition: ~5–8 min

---

## What This Doesn't Cover (Future)

- Model-as-judge evaluation (needs a second, stronger model)
- Prompt versioning and A/B comparison
- Cost/token tracking (Ollama is free, no tokens to count)
- Human evaluation workflows
- Embedding-based semantic similarity (overkill for category classification)

These become relevant when moving to a real LLM backend (OpenAI, Anthropic, hosted models with costs).
