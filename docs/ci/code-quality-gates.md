# Code Quality Gates — Custom ESLint Rules

## What This Is

Custom ESLint rules that enforce resilience patterns in service code. Each rule traces back to a real failure observed during Phase 4 chaos experiments.

This is the code-level complement to manifest validation — manifests enforce infrastructure standards (replicas, limits, probes), these rules enforce coding standards (timeouts, error handling).

## Rules

### `resilience/fetch-requires-timeout`

**Chaos origin:** Phase 4 Step 3 — Dependency failure. `fetch()` without a timeout hung forever when Service B was unreachable. The catch block never fired because the request never completed.

**What it enforces:** Every `fetch()` call must include `AbortSignal.timeout()` in the signal option.

```typescript
// ✅ Passes
const res = await fetch(url, { signal: AbortSignal.timeout(3000) });

// ❌ Fails — no timeout
const res = await fetch(url);

// ❌ Fails — options but no signal
const res = await fetch(url, { headers: {} });
```

### `resilience/fetch-requires-error-handling`

**Chaos origin:** Phase 4 Step 3 — Dependency failure. An unhandled fetch error crashed the process instead of returning a graceful error response. The pod restarted instead of degrading gracefully.

**What it enforces:** Every `fetch()` call must be wrapped in try/catch or have a `.catch()` handler.

```typescript
// ✅ Passes — try/catch
try {
  const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
} catch {
  res.status(502).json({ error: "downstream unreachable" });
}

// ✅ Passes — .catch()
fetch(url, opts).catch(err => handleError(err));

// ❌ Fails — no error handling
const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
```

## Architecture

```
eslint-plugin-resilience/
├── index.mjs                              # Plugin entry — exports all rules
└── rules/
    ├── fetch-requires-timeout.mjs         # AbortSignal.timeout on fetch
    └── fetch-requires-error-handling.mjs  # try/catch or .catch on fetch
```

Each rule is a single file with the standard ESLint rule module shape (`meta` + `create`). Adding a new rule means creating a file in `rules/` and adding it to `index.mjs`.

## How It Runs

The rules are loaded in `eslint.config.mjs` as a local plugin:

```javascript
import resilience from "./eslint-plugin-resilience/index.mjs";

export default [
  {
    files: ["services/*/src/**/*.ts"],
    plugins: { resilience },
    rules: {
      "resilience/fetch-requires-timeout": "error",
      "resilience/fetch-requires-error-handling": "error",
    },
  },
];
```

No new CI steps — the rules run in the existing `npm run lint` step. IDE feedback works immediately with the ESLint extension.

## Where This Should Live in a Real Org

In a real organisation, resilience rules like these belong in a **shared coding standards package** — not in individual service repos. The progression:

### Stage 1: In the project (now)

Rules live in `eslint-plugin-resilience/` inside this repo. Good for discovery — you're still learning what the rules should be and refining them as new chaos experiments reveal new patterns.

### Stage 2: Shared ESLint plugin

Once the rules are stable and multiple services need them, extract to a standalone package:

```
@myorg/eslint-plugin-resilience
├── rules/
│   ├── fetch-requires-timeout.mjs
│   ├── fetch-requires-error-handling.mjs
│   └── ... (future rules from Phase 6-7)
└── package.json
```

Services install it and enable the rules they need:

```javascript
import resilience from "@myorg/eslint-plugin-resilience";

export default [
  {
    plugins: { resilience },
    rules: {
      "resilience/fetch-requires-timeout": "error",
      "resilience/fetch-requires-error-handling": "error",
    },
  },
];
```

### Stage 3: Part of org-wide coding standards

In mature orgs, resilience rules get folded into the shared coding standards config (like `@myorg/eslint-config`). Every service gets them by default — no opt-in required.

```javascript
// @myorg/eslint-config includes resilience rules automatically
import config from "@myorg/eslint-config";

export default [...config.configs.main];
// resilience rules are already enabled
```

This is the pattern used by shared coding standards packages — a base config that includes standard rules (airbnb, prettier, security) plus org-specific rules (resilience, observability, API conventions). Teams get everything by installing one package.

### Stage 4: Entry point in platform quality utils

Alternatively, the rules could live as an entry point in the multi-entry utility package:

```typescript
import { plugin } from "@myorg/platform-quality-utils/eslint-resilience";
```

This keeps all quality tooling (manifest validation, chaos reporting, ESLint rules, AI assertions) in one package. Teams cherry-pick what they need.

### Which path to take

| Signal | Action |
|---|---|
| Rules are still changing | Keep in project (Stage 1) |
| 2+ services need the same rules | Extract to standalone plugin (Stage 2) |
| Org has a shared coding standards package | Fold into it (Stage 3) |
| Rules are part of a broader quality toolkit | Entry point in platform-quality-utils (Stage 4) |

The current one-file-per-rule structure works for all four stages — extraction is a `package.json` away, not a rewrite.

## Future Rules

Rules to consider as the project grows:

| Rule | Phase | What it would enforce |
|---|---|---|
| `resilience/axios-requires-timeout` | Phase 5 | axios calls must have `timeout` config |
| `resilience/config-requires-validation` | Phase 6 | Environment config must use Zod/schema validation, not bare `process.env` |
| `resilience/health-no-downstream` | Phase 6 | `/health` (liveness) endpoints must not call downstream services |
| `resilience/otel-span-requires-attributes` | Phase 6 | OpenTelemetry spans must include required attributes |

Each rule should trace back to a real failure or chaos experiment — don't add rules speculatively.

## Adding a New Rule

1. Create a new file in `eslint-plugin-resilience/rules/`:

```javascript
/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: { description: "..." },
    messages: { ruleViolation: "..." },
    schema: [],
  },
  create(context) {
    return {
      // AST visitor
    };
  },
};
```

2. Add it to `eslint-plugin-resilience/index.mjs`
3. Enable it in `eslint.config.mjs`
4. Document the chaos experiment or failure it traces back to
