# Manifest Validation — Phase 5 CI Guardrail

## What This Is

A policy validation layer for K8s manifests that runs in CI before deployment. It parses YAML manifests and enforces rules learned from Phase 4 chaos experiments.

This is **Layer 2** validation. Layer 1 (schema validation via `kubeconform`) checks whether the YAML is valid K8s. Layer 2 checks whether the YAML meets our operational standards — replicas, resource limits, probes, overcommit ratios.

## Why It Exists

Every rule traces back to a real failure observed during Phase 4 chaos testing:

| Rule | Chaos experiment | What went wrong |
|---|---|---|
| `replicas-minimum` | Step 1: Pod kill | 1 replica = full outage when the pod dies |
| `resource-limits-cpu` | Step 2: CPU throttling | No CPU limit lets a runaway pod starve the entire node |
| `resource-limits-memory` | Step 2: OOMKill | No memory limit lets a pod consume unbounded memory until the node dies |
| `resource-requests-cpu` | Step 2: Resource pressure | Scheduler can't place pods correctly without requests |
| `resource-requests-memory` | Step 2: Resource pressure | Same — scheduler needs requests for placement decisions |
| `readiness-probe` | Step 3: Dependency failure | Without readiness, K8s sends traffic to pods that aren't ready |
| `liveness-probe` | Step 3: Dependency failure | Without liveness, a deadlocked process stays "running" forever |
| `probe-separation` | Step 3: Dependency failure | Same path for readiness and liveness means K8s either kills healthy pods on dependency blips, or sends traffic to broken pods |
| `memory-limit-ratio` | Step 2: OOMKill | Limit 100x the request = massive overcommit, surprise OOMKills when pods burst |

The pattern: **break it → understand why it matters → encode a guardrail → never regress.**

## How It Works

```
k8s/*.yaml → parse YAML → extract Deployments → run rules → filter skips → report
```

1. Collects all `.yaml` files in `k8s/`, excluding files listed in `validation-config.yaml`
2. Parses each file and extracts Deployment documents (skips Services, ConfigMaps, etc.)
3. Runs every rule against every Deployment
4. Filters out violations that are explicitly skipped in the config
5. Reports violations and exits non-zero if any remain

### Running It

```bash
# Locally
npm run validate:manifests

# In CI (runs automatically in the validate-k8s job)
# Step 1: kubeconform -strict -summary k8s/   (schema)
# Step 2: npm run validate:manifests           (policy)
```

## Architecture

```
scripts/
├── validate-manifests.ts                    # Orchestrator — load, scan, report
└── manifest-validation/
    ├── types.ts                             # Interfaces + Rule type
    ├── config.ts                            # Load config, check exclusions/skips
    ├── collectFiles.ts                      # Recursively find YAML files
    ├── parseMemory.ts                       # Convert K8s memory strings to bytes
    └── rules/
        ├── index.ts                         # Exports all rules as array
        ├── replicasMinimum.ts               # replicas >= 2
        ├── resourceLimits.ts                # CPU/memory limits + requests exist
        ├── probesExist.ts                   # readiness + liveness probes exist
        ├── probeSeparation.ts               # readiness ≠ liveness for services with deps
        └── memoryLimitRatio.ts              # memory limit/request ratio <= 4x
```

### Why This Structure

Each rule is a single file with a single exported function. Each helper is a single file with a single concern. This follows the one-concern-per-file pattern used in production codebases for two reasons:

**Readability.** A rule file is 15–25 lines. You open it, you see what it checks, you see the Phase 4 comment explaining why. No scrolling through a 200-line function to find the rule you care about.

**Composability.** Each file is an independent export. This matters when the validation becomes a shared package (see below).

### The Rule Interface

Every rule is a function with the same signature:

```typescript
type Rule = (input: { doc: K8sDocument; filePath: string }) => Violation[]
```

Input: a parsed K8s Deployment document and its file path.
Output: an array of violations (empty if the rule passes).

Adding a new rule means creating a new file in `rules/` and adding it to `rules/index.ts`. No changes to the orchestrator, no changes to other rules.

## Skip List / Exceptions

`k8s/validation-config.yaml` controls what gets validated and what gets skipped.

### File exclusions

Files that should never be validated:

```yaml
excludeFiles:
  - "vendor/**"          # Third-party manifests — not ours to validate
  - "pact-broker.yaml"   # Reference manifest — not deployed
  - "postgres.yaml"      # Reference manifest — not deployed
```

### Rule skips

Per-rule, per-file exceptions with documented reasons:

```yaml
skipRules:
  replicas-minimum:
    - file: "some-singleton.yaml"
      reason: "Leader-election singleton — only 1 replica by design"
```

Every skip requires a reason. If you can't explain why the rule doesn't apply, don't skip it.

This is the same pattern used in production policy tools — Checkov has `skip.txt`, OPA has exception lists, Kyverno has policy exclusions. The skip list is the documented decision record of "we know about this, and here's why it's ok."

## Validation Layers — The Full Picture

K8s manifest validation has three layers. Most mature organisations use all three:

### Layer 1: Schema Validation (implemented)

**Tool:** `kubeconform` (or `kubeval`)
**What it checks:** Is this valid K8s YAML? Do the fields match the API schema?
**Catches:** Typos, wrong apiVersion, invalid field names, malformed YAML.
**Where it runs:** CI, before deployment.

### Layer 2: Policy Validation (implemented — this)

**Tool:** Custom rules (this script), or OPA/Gatekeeper, Kyverno, Datree.
**What it checks:** Does this manifest meet our operational standards?
**Catches:** Missing replicas, no resource limits, wrong probe config — valid K8s but bad practice.
**Where it runs:** CI, before deployment.

### Layer 3: Admission Control (not implemented — production clusters)

**Tool:** OPA Gatekeeper or Kyverno as admission controllers.
**What it checks:** Same policies as Layer 2, but enforced at `kubectl apply` time in the cluster.
**Catches:** Anything that bypasses CI — manual kubectl, emergency deploys, drift.
**Where it runs:** In the cluster, at apply time.

Layer 3 is out of scope for this project (Kind clusters are ephemeral), but worth knowing it exists. In production, Layers 2 and 3 enforce the same rules — Layer 2 gives fast feedback in CI, Layer 3 is the safety net in the cluster.

## Packaging Strategy — When and How

The code is structured for extraction into a shared package, but **we're not packaging it yet**. Here's why, and how it grows.

### Why Not Now

Packaging too early locks you into a structure before you know the full shape. This project will produce more quality tooling as it progresses:

- **Phase 5:** Manifest validation rules (done), chaos CI utilities, code quality gates
- **Phase 7:** AI assertion helpers, golden set runners, accuracy benchmarks

Until more of that exists, we don't know whether the final shape is one focused package or a collection of tools. The one-concern-per-file structure works for both futures — no code changes needed either way, just a `package.json` and an exports map when the time comes.

### Two Packaging Patterns

When the time comes to extract, there are two patterns used in production:

#### Pattern 1: Single-Purpose Package

One package, one concern. A focused tool that does one thing well.

```
@myorg/manifest-validation/
├── src/
│   ├── types.ts
│   ├── config.ts
│   ├── collectFiles.ts
│   ├── parseMemory.ts
│   └── rules/
└── package.json
```

Consumers install it and get manifest validation. Nothing else.

```typescript
import { replicasMinimum, probesExist } from '@myorg/manifest-validation/rules'
import { collectYamlFiles } from '@myorg/manifest-validation/collectFiles'
```

**When this fits:** The tool is self-contained and other teams only need this one thing. Good for early extraction when you have one mature tool.

#### Pattern 2: Multi-Entry Utility Package

One package, multiple entry points. A collection of related quality tools that consumers cherry-pick from.

```
@myorg/platform-quality-utils/
├── src/
│   ├── manifest-validation/    → entry point: @myorg/platform-quality-utils/manifest-validation
│   ├── chaos/                  → entry point: @myorg/platform-quality-utils/chaos
│   ├── ai-assertions/          → entry point: @myorg/platform-quality-utils/ai-assertions
│   └── ci-reporting/           → entry point: @myorg/platform-quality-utils/ci-reporting
└── package.json (with exports map)
```

The `exports` map in `package.json` makes each entry point a separate importable path. Consumers only pull in what they use — a team that doesn't have AI services never touches `ai-assertions`.

```typescript
import { rules } from '@myorg/platform-quality-utils/manifest-validation'
import { podKill } from '@myorg/platform-quality-utils/chaos'
import { goldenSetRunner } from '@myorg/platform-quality-utils/ai-assertions'
```

**When this fits:** You have multiple related tools that share a common purpose (platform quality) but serve different use cases. Teams install one package and pick the parts they need.

#### How the exports map works

The `exports` field in `package.json` maps import paths to built files. Each entry point is independently importable — consumers don't pay for what they don't use.

```json
{
  "name": "@myorg/platform-quality-utils",
  "exports": {
    "./manifest-validation": {
      "import": "./dist/manifest-validation/index.mjs",
      "types": "./dist/manifest-validation/index.d.mts"
    },
    "./chaos": {
      "import": "./dist/chaos/index.mjs",
      "types": "./dist/chaos/index.d.mts"
    },
    "./ai-assertions": {
      "import": "./dist/ai-assertions/index.mjs",
      "types": "./dist/ai-assertions/index.d.mts"
    }
  }
}
```

### The Growth Path

| Stage | What exists | Packaging decision |
|---|---|---|
| Now (Phase 5 — manifest validation) | One tool, still evolving | Don't package — keep in `scripts/` |
| Phase 5 complete (chaos gates, code quality) | 2–3 related tools | Still early — could go either way |
| Phase 7 complete (AI assertions, golden sets) | 4+ tools across different concerns | Extract as multi-entry package (Pattern 2) |
| Org adoption | Multiple teams consuming the tools | Publish to internal registry, version independently |

The key insight: the one-concern-per-file structure we have now is the foundation for both patterns. Each file becomes an independent export. The `Rule` interface means external consumers can add their own rules without forking. The config/skip system means each project customises behaviour without changing the package.

**Don't package until you know the shape. Structure the code so packaging is a `package.json` away, not a rewrite.**

### Publishing Plan — GitHub Packages

When the time comes to extract, publish as a private package to **GitHub Packages** (free for private repos, tied to your GitHub account). This is the same workflow used in real orgs with internal registries.

#### Why GitHub Packages

- **Free** for private packages (npm's private packages cost $7/month)
- **Already integrated** — the repo is on GitHub, auth uses the same GitHub token
- **Scoped to your account** — `@joxkalna/platform-quality-utils` (or whatever your GitHub username is)
- **Same `npm install` workflow** — consumers just add a `.npmrc` pointing to GitHub's registry for your scope

#### What extraction looks like

When there are 3+ tools in `scripts/`, create a `packages/` directory:

```
platform-quality-lab/
├── packages/
│   └── platform-quality-utils/
│       ├── src/
│       │   ├── manifest-validation/   # moved from scripts/manifest-validation/
│       │   ├── chaos/                 # moved from scripts/chaos-reporting/
│       │   └── ai-assertions/         # from Phase 7
│       ├── package.json               # @joxkalna/platform-quality-utils
│       └── tsconfig.json
├── services/
├── scripts/                           # orchestrators remain here, import from package
└── ...
```

The orchestrators (`validate-manifests.ts`, etc.) stay in `scripts/` and import from the package. Other projects in `development/` install the package normally.

#### How consumers use it

Another project in `development/` adds a `.npmrc`:

```
@joxkalna:registry=https://npm.pkg.github.com
```

Then installs:

```bash
npm install @joxkalna/platform-quality-utils
```

And imports only what they need:

```typescript
import { rules } from '@joxkalna/platform-quality-utils/manifest-validation'
import { goldenSetRunner } from '@joxkalna/platform-quality-utils/ai-assertions'
```

#### When to pull the trigger

- **Not now** — one tool, still evolving
- **After Phase 7** — 4+ tools, the shape is clear, other projects can consume it
- **The signal:** when you find yourself copying code from this repo into another project in `development/` — that's when you extract and publish

## Adding a New Rule

1. Create a new file in `scripts/manifest-validation/rules/`:

```typescript
import type { Rule } from '../types'

export const myNewRule: Rule = ({ doc, filePath }) => {
  // Check something on the Deployment
  // Return [] if it passes, or [{ file, resource, rule, message }] if it fails
}
```

2. Add it to `scripts/manifest-validation/rules/index.ts`:

```typescript
import { myNewRule } from './myNewRule'

export const rules: Rule[] = [
  // ... existing rules
  myNewRule,
]
```

3. Document why the rule exists — what failure it prevents, what chaos experiment or production incident it traces back to.

No changes to the orchestrator. No changes to other rules. No changes to CI.
