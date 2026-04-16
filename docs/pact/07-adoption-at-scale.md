# Adoption at Scale — Getting Pact Working Across Teams

## The Problem

Pact requires both sides to participate. A consumer publishing a pact is useless if the provider team doesn't verify it. In a large org with dozens of teams, the challenge isn't the tooling — it's getting teams to understand and adopt it.

A common first attempt is to centralise everything: build a shared Docker image with all the tools baked in, provide pipeline templates that teams extend, and hope they adopt it. This works technically but struggles in practice.

## Why Centralised Pipeline Templates Struggle

The typical approach: a platform team builds a shared CI image containing the Pact Broker CLI, shell helper functions, and reusable pipeline job templates. Service teams add a few lines of config to their pipeline and everything "just works."

The problems:

- **Black box** — teams extend a shared job without understanding what it does. When it breaks, they can't debug it and raise a ticket instead
- **Coupling** — every team depends on one image, one pipeline repo, one platform team to make changes. A bad image release breaks 50 pipelines
- **Knowledge bottleneck** — the platform team understands Pact, product teams don't. They copy-paste config without learning the concepts
- **Upgrade pain** — updating the shared image or templates requires coordinating across all consumers of it
- **No local development** — teams can't run the Pact workflow locally because it's all wired into CI-specific templates

The result: teams technically have Pact enabled but don't understand it, can't troubleshoot it, and treat it as someone else's problem.

## Alternative Approaches

### 1. CLI Wrapper (Lightest Touch)

Instead of baking everything into a Docker image, publish a single CLI tool that wraps the `pact-broker` commands with org defaults:

```bash
npx @myorg/pact-cli can-i-deploy --service my-service --env qa
npx @myorg/pact-cli record-deployment --service my-service --env qa
npx @myorg/pact-cli publish ./pacts
```

The CLI handles:
- Environment mapping (internal account names → Broker environment names)
- Credentials fetching (from the secrets store, not hardcoded)
- Retry logic (`--retry-while-unknown` for async verification)
- Version tagging (git SHA, branch name)

Could be an npm package, a Go binary, or even a shell script — whatever fits the org's stack.

**Why it helps adoption:**
- Teams see what they're running — no magic
- Works locally, not just in CI
- `--help` is self-documenting
- Teams can read the source if they want to understand the internals
- Runs in any CI system, not tied to one platform

### 2. Template Repo / Scaffolding

Instead of shared pipeline templates that teams reference, provide a generator that scaffolds Pact into an existing repo:

```bash
npx @myorg/create-pact-consumer
# → creates: pact test file, test config, CI job definition, README section

npx @myorg/create-pact-provider
# → creates: verifier test, state handler stubs, CI job definition, initialises with Broker
```

Teams get real files in their repo that they own and can modify. Not references to external templates they can't see.

**Why it helps adoption:**
- Teams learn by reading the generated code
- They own the files — can customise without waiting on the platform team
- No hidden abstractions
- New team members can read the test files and understand the contract

### 3. Golden Example Repos (Documentation-as-Code)

Maintain 2–3 real, working example repos:

- A **consumer** repo with Pact wired in end-to-end
- A **provider** repo with Pact wired in end-to-end
- A repo that's **both consumer and provider** (the most common real-world case)

These aren't templates — they're running services with real CI pipelines that pass. They have:
- Actual pact tests that generate contracts
- A working CI pipeline that publishes, verifies, and gates deployment
- Comments explaining why each piece exists
- A README walking through the workflow

**Why it helps adoption:**
- People learn from working examples, not documentation
- Teams can fork, break, and rebuild to understand the flow
- New starters can run the example locally in 5 minutes
- The examples stay honest — if the pipeline breaks, you fix it

### 4. Pact as a Platform Service (Most Investment)

Instead of asking every team to wire up Pact themselves, the platform provides it as a managed service:

- Teams register their service via a self-service portal or API
- The platform auto-generates webhooks, initialises the provider, sets up environments
- `can-i-deploy` is a mandatory deployment gate baked into the deployment platform itself — not each team's pipeline
- A dashboard shows contract status across all services
- Alerts fire when contracts are broken or unverified

Teams only write the test files. Everything else is handled.

**Why it helps adoption:**
- Lowest friction for product teams
- Impossible to skip — `can-i-deploy` is a platform gate, not an optional CI job
- Visibility across the org via the dashboard
- Platform team can enforce standards (e.g. every service with an API must have a contract)

**Trade-offs:**
- Highest upfront investment
- Platform team becomes a dependency for onboarding
- Less flexibility for teams with unusual setups

### 5. Hybrid (Most Realistic)

In practice, combine approaches based on the org's maturity:

| Stage | Approach | Goal |
|---|---|---|
| Getting started | Golden example repos (3) | Teams learn the concepts |
| First adopters | Scaffolding (2) | Fast onboarding with real files |
| Scaling | CLI wrapper (1) | Consistent commands, works locally |
| Org-wide | Platform gate (4) | `can-i-deploy` is mandatory |

Add to this:
- **Lunch-and-learn sessions** where the team that just onboarded teaches the next team — knowledge spreads peer-to-peer, not top-down
- **Pairing sessions** where the platform team pairs with a product team to set up their first contract — hands-on beats documentation
- **A Slack channel** (or equivalent) where teams ask questions and share patterns — builds a community of practice

## The Shared Docker Image Pattern (When It Makes Sense)

The centralised image approach isn't wrong — it solves a real problem: ensuring every pipeline uses the same tool versions. In an org with 100+ repos, you don't want each one installing `pact-broker-client` independently.

A typical shared CI image contains:
- Language runtimes (Node.js, Python)
- Cloud CLI tools (infrastructure CLI, IaC tools)
- Linting and security scanning tools (cfn-lint, cfn-guard, checkov)
- The Pact Broker CLI (`pact_broker-client` gem or `@pact-foundation/pact-cli`)
- Custom shell libraries sourced via `/etc/profile.d/` — helper functions for environment mapping, deployment recording, can-i-deploy checks
- Utility scripts baked into `/usr/local/bin/` — assume-role, slack notifications, etc.

The image is built once, pushed to a container registry, and every CI job pulls it via a version tag.

**What the shell libraries typically handle:**

```bash
# Environment mapping — internal account names to Broker environments
pact_map_environments()  # "my-dev-account" → "dev", "my-prod-account" → "prod"

# Record deployment — only on protected main branch
pact_record_deployment()  # guards: is protected? is main? pact enabled? pacticipants defined?

# Can-i-deploy — with retry for async verification
pact_can_i_deploy()  # --retry-while-unknown=10 --retry-interval=20

# Create version if missing — workaround for providers with no verification results
pact_create_version_if_does_not_exist()
```

**When this pattern works well:**
- The org has a single CI platform that all teams use
- The platform team has capacity to maintain the image and respond to issues quickly
- Teams are willing to adopt a standardised pipeline structure
- There's good documentation and support around the shared templates

**When it doesn't:**
- Teams use different CI platforms
- The platform team is a bottleneck
- Teams need to customise their pipeline beyond what the templates allow
- Nobody understands what the templates do

## Key Insight

The real problem isn't technical — it's that Pact requires bilateral adoption. Both the consumer team and the provider team must participate. No amount of pipeline automation fixes this if teams don't understand why they're doing it.

The fix is:
1. **Make it easy to start** — scaffolding, golden repos
2. **Make it easy to understand** — CLI with `--help`, working examples, pairing sessions
3. **Make it easy to run locally** — CLI wrapper, not CI-only templates
4. **Make it impossible to skip** — `can-i-deploy` as a platform deployment gate
5. **Make knowledge spread** — peer-to-peer teaching, community of practice

The knowledge problem solves itself when teams can see what's happening, run it locally, and have someone to ask when they get stuck.

## Further Reading

- [Pact Nirvana — the recommended CI/CD maturity model](https://docs.pact.io/pact_nirvana)
- [06-repo-separation.md](./06-repo-separation.md) — how the monorepo maps to multi-repo in a real org
- [05-ci-cd-patterns.md](./05-ci-cd-patterns.md) — CI/CD pipeline patterns for Pact
