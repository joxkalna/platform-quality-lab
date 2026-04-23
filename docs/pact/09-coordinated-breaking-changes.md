# Coordinated Breaking Changes — The Monday Morning Playbook

## The Scenario

Friday 4pm. Major incident. A field that was always meant to be a `string` has been a `number` since day one. Both consumer and provider teams agree it needs to change. No backwards compatibility — this isn't a v2, it was a mistake.

The fix ships Friday using break-glass (`[skip pact]`). Pact is disabled. Both services deploy with the corrected type.

Monday morning: Pact is still disabled. The Broker thinks `confidence` is a `number`. Reality says `string`. The contract needs to catch up with the code.

## Why This Is Stressful

In a large org this involves:
- Multiple teams (consumer team, provider team, platform team)
- Multiple pipelines (each repo has its own CI)
- A shared Broker that gates every deployment
- The risk that re-enabling Pact breaks unrelated deployments

Getting the order wrong means either:
- Pact blocks the next deployment (the fix didn't stick)
- Pact is disabled for too long (other contract changes slip through unchecked)
- Teams waste hours debugging why `can-i-deploy` fails on Monday when "we already fixed this Friday"

## Multi-Repo (Separate Pipelines)

This is the cleaner path. Each repo deploys independently, and Pact's `enablePending` handles the transition naturally.

### Step-by-step

```
1. Consumer repo — update pact test (confidence: string)
   └── Pipeline: test → publish new pact to Broker → can-i-deploy (PASSES*)
       * Consumer can deploy because the DEPLOYED provider version
         was updated Friday (it already returns string)

2. Broker receives new pact
   └── Webhook fires → triggers provider pipeline

3. Provider repo — re-enable Pact (remove skip flag)
   └── Pipeline: verify against new pact (string) → PASSES
       Provider already returns string (deployed Friday)

4. Both sides green. can-i-deploy passes for both. Done.
```

### Why it works

- The provider was already deployed Friday returning `string`
- The consumer publishes a new pact expecting `string`
- `enablePending: true` means the new pact doesn't break the provider while it's unverified
- Once the provider verifies (step 3), the Broker knows both sides agree
- `can-i-deploy` passes for both because the deployed versions match the new contract

### The key insight

**Consumer goes first.** Always. The consumer defines what it expects. The provider proves it can deliver. In a breaking change, the consumer publishes the new expectation, and the provider catches up. `enablePending` is the safety net — the new pact sits as "pending" until the provider verifies it, without blocking anything.

### What if the provider hasn't deployed the fix yet?

If Friday's emergency only deployed the consumer (provider fix is still pending):

1. Consumer publishes new pact (string) → pending on Broker
2. Provider still returns number → verification against new pact fails, but it's pending so pipeline passes
3. Provider deploys the fix → verification passes → pending pact becomes verified
4. `can-i-deploy` for consumer now passes

Same flow, just slower. `enablePending` absorbs the gap.

## Monorepo (Single Pipeline)

This is where it gets painful. One commit, one pipeline, both sides change together.

### The problem

```
1. Consumer test generates new pact (confidence: string)
2. Publish to Broker
3. Provider verification runs
   └── Verifies against consumerVersionSelectors:
       - { matchingBranch: true }     → new pact (string) → PASSES ✅
       - { deployedOrReleased: true } → OLD pact (number) → FAILS ❌
```

The provider can't satisfy both the new pact (string) and the old deployed pact (number) at the same time. This is a **genuinely breaking change** — the provider's response is incompatible with what was previously deployed.

### Options (in order of preference)

#### Option 1: Two-commit approach

Split the change across two commits in the same branch:

```
Commit 1: Consumer pact test (string) + publish
          Provider verification skipped or continue-on-error
          → New pact lands on Broker as pending

Commit 2: Re-enable strict verification
          Provider verifies against new pact → passes
          Old deployed pact is superseded by the new deployment record
```

This mimics the multi-repo flow within a single branch. The first commit is the consumer "going first", the second is the provider catching up.

**Downside:** Requires two pipeline runs. The first run has a weakened gate.

#### Option 2: Skip Pact for one commit, fix on the next

This is what we did Friday:

```
Commit 1: [skip pact] — both sides change, Pact skipped entirely
Commit 2: Remove [skip pact] — full pipeline, Pact re-enabled
          New pact published, provider verifies, can-i-deploy passes
```

**Downside:** One commit has zero contract coverage. If the change is wrong, nothing catches it until commit 2.

#### Option 3: continue-on-error on provider verification

```yaml
- name: Run provider verification
  continue-on-error: true
  run: npm run test:pact:verify
```

The verification results still publish to the Broker (so you can see what failed), but the pipeline continues. `can-i-deploy` at the same commit checks both services together.

**Downside:** Masks real failures. If something else is broken, you won't know until you remove `continue-on-error`.

#### Option 4: Temporarily narrow consumerVersionSelectors

Remove `{ deployedOrReleased: true }` from the provider verification config for one commit, so it only verifies against the branch pact:

```typescript
consumerVersionSelectors: [
  { matchingBranch: true },
  // { deployedOrReleased: true },  // Temporarily removed for breaking change
],
```

**Downside:** Dangerous. If another consumer has a deployed pact that the provider should verify against, it's silently skipped.

### Recommended monorepo approach

**Option 2** (`[skip pact]` → re-enable) is the safest for a genuine emergency. It's explicit, auditable, and the break-glass procedure is already documented.

For a planned breaking change (not an emergency), **Option 1** (two commits) is cleaner — it keeps Pact running throughout and mimics the natural multi-repo flow.

## The Recovery Checklist

Regardless of repo structure, after the emergency:

- [ ] All code changes are deployed (consumer and provider return/expect the new type)
- [ ] Break-glass workarounds are removed (`[skip pact]`, `continue-on-error`, `if: always()`)
- [ ] Consumer pact test updated to expect the new type
- [ ] Provider verification passes against the new pact
- [ ] `can-i-deploy` passes for all services
- [ ] PactFlow UI shows green verification for the latest versions
- [ ] Fixtures and test data updated to match the new type
- [ ] TypeScript types updated (no `as any` or type mismatches)
- [ ] Incident log updated with what happened and why break-glass was used

## What We Learned (This Project)

We deliberately broke `confidence` from `number` to `string` to exercise this exact scenario.

**Timeline:**
1. Changed `confidence` type in Service C (provider) and consumer pact test
2. Provider verification failed — old deployed pact expected `number`, provider now returns `string`
3. Used `[skip pact]` to deploy the fix
4. Added `if: always()` on `deploy-and-test` so it runs when pact is skipped
5. Monday: updated all fixtures, fixed `parseResponse` return type, removed break-glass workarounds
6. Pushed with Pact re-enabled — new pact published, provider verified, `can-i-deploy` passed

**The gap we found:** In a monorepo, there is no clean way to deploy a coordinated breaking change through Pact without at least one commit that weakens the gate. Multi-repo handles this naturally through `enablePending` and deployment ordering. Monorepo doesn't have that luxury because there's no "deploy consumer first, then provider" — it's one atomic commit.

**The takeaway:** This is not a Pact limitation — it's a fundamental property of breaking changes. If you change a type that both sides depend on, there will be a moment where the old contract and the new code disagree. In multi-repo, `enablePending` absorbs that moment gracefully. In monorepo, you have to manage it manually.

## How to Change Contracts Safely (MUST READ)

The emergency playbook above exists for when things go wrong. This section exists so things don't go wrong in the first place.

**Rule: Never change a field type, remove a field, or restructure a response in a single deployment.** Use Expand and Contract — the same pattern used for database migrations, feature flags, and every other system where two versions must coexist during a rollout.

This applies to both monorepo and multi-repo. The difference is that multi-repo gives you `enablePending` as a safety net if you mess up. Monorepo gives you nothing — get the order wrong and the pipeline breaks.

### Pattern 1: Field Evolution (Expand and Contract)

Use this when: changing a field type, renaming a field, or splitting a field into multiple fields.

Real example — changing `confidence` from `number` to `string`:

#### Step 1: Provider adds new field alongside old one

Provider PR — no consumer changes.

```typescript
// Provider response — BEFORE
{ confidence: 0.95, category: "critical", model: "llama3.2:1b" }

// Provider response — AFTER (this PR)
{ confidence: 0.95, confidenceStr: "0.95", category: "critical", model: "llama3.2:1b" }
```

Consumer pact still expects `confidence` (number). Provider returns both. Pact passes — extra fields are ignored by default.

**Rollback safe:** Remove the PR. Consumer still gets `confidence` (number). Nothing breaks.

#### Step 2: Consumer switches to new field

Consumer PR — no provider changes.

```typescript
// Consumer pact — BEFORE
confidence: MatchersV3.decimal(0.95)

// Consumer pact — AFTER (this PR)
confidenceStr: MatchersV3.string('0.95')
// confidence is no longer asserted on
```

New pact published. Provider still returns both fields. Verification passes because `confidenceStr` exists and is a string.

**Rollback safe:** Revert consumer. Old pact (asserting `confidence` number) is restored. Provider still returns both. Nothing breaks.

#### Step 3: Provider removes old field

Provider PR — no consumer changes.

```typescript
// Provider response — BEFORE
{ confidence: 0.95, confidenceStr: "0.95", category: "critical", model: "llama3.2:1b" }

// Provider response — AFTER (this PR)
{ confidenceStr: "0.95", category: "critical", model: "llama3.2:1b" }
```

Before merging, check: does any consumer pact still assert on `confidence`? `can-i-deploy` answers this. If a consumer still depends on it, the pipeline blocks the removal.

**Rollback safe:** Revert provider. Both fields return. Consumer uses `confidenceStr`. Nothing breaks.

#### Step 4 (optional): Rename to clean name

If you want `confidence` back (as a string this time), repeat steps 1-3:
- Provider adds `confidence` (string) alongside `confidenceStr`
- Consumer switches from `confidenceStr` to `confidence`
- Provider removes `confidenceStr`

This step is optional. Many teams skip it and live with `confidenceStr` forever. That's fine — a slightly ugly field name is better than a production incident.

#### Summary

```
Step 1: Provider adds confidenceStr (string) alongside confidence (number)
        Consumer pact: confidence (number) → ✅
        Rollback: remove new field, consumer unaffected

Step 2: Consumer switches pact to confidenceStr (string)
        Provider returns both → ✅
        Rollback: revert consumer, provider still returns both

Step 3: Provider removes confidence (number)
        No consumer asserts on it → can-i-deploy confirms → ✅
        Rollback: add field back, consumer uses confidenceStr

Step 4: (Optional) Rename confidenceStr → confidence
        Repeat steps 1-3 with the rename
```

Four PRs. Four green builds. Zero skip flags. Zero `continue-on-error`. Zero 4pm Friday incidents.

### Pattern 2: Endpoint Versioning

Use this when: the response structure changes fundamentally, multiple fields change at once, or the endpoint semantics change (same URL, different behaviour).

Real example — `/classify` response changes from flat to nested:

```typescript
// v1: flat
{ category: "critical", confidence: 0.95, model: "llama3.2:1b" }

// v2: nested
{ result: { category: "critical", confidence: "0.95" }, metadata: { model: "llama3.2:1b", latency: 230 } }
```

Field evolution would be absurd here — too many fields changing. Version the endpoint instead.

#### Step 1: Provider adds /v2 alongside /v1

Provider PR — no consumer changes.

```typescript
// Provider serves both
app.post('/v1/classify', handleV1)  // existing — unchanged
app.post('/v2/classify', handleV2)  // new — nested response
```

Consumer pact still hits `/v1/classify`. Provider serves both. Pact passes.

**Rollback safe:** Remove `/v2` route. Consumer still uses `/v1`. Nothing breaks.

#### Step 2: Consumer switches to /v2

Consumer PR — no provider changes.

```typescript
// Consumer pact — BEFORE
.withRequest('POST', '/v1/classify')
.willRespondWith(200, (builder) => {
  builder.jsonBody({ category: MatchersV3.string(), confidence: MatchersV3.decimal() })
})

// Consumer pact — AFTER (this PR)
.withRequest('POST', '/v2/classify')
.willRespondWith(200, (builder) => {
  builder.jsonBody({
    result: { category: MatchersV3.string(), confidence: MatchersV3.string() },
    metadata: { model: MatchersV3.string(), latency: MatchersV3.integer() },
  })
})
```

New pact published. Provider serves `/v2`. Verification passes.

**Rollback safe:** Revert consumer. Old pact hits `/v1`. Provider still serves both. Nothing breaks.

#### Step 3: Provider removes /v1

Provider PR — no consumer changes (consumer already moved to `/v2` in step 2).

```typescript
// Provider — BEFORE
app.post('/v1/classify', handleV1)
app.post('/v2/classify', handleV2)

// Provider — AFTER (this PR)
app.post('/v2/classify', handleV2)
```

Before merging, `can-i-deploy` checks every deployed consumer pact. Since step 2 already switched the consumer to `/v2`, no deployed pact references `/v1` anymore. Safe to remove.

If a consumer somehow still depends on `/v1` (e.g. step 2 wasn't deployed yet, or a different consumer you forgot about), `can-i-deploy` blocks this PR. That's the safety net.

**Rollback safe:** Add `/v1` back. No consumer uses it, but it doesn't hurt.

#### Summary

```
Step 1: Provider adds /v2/classify alongside /v1/classify
        Consumer pact: /v1 → ✅
        Rollback: remove /v2 route

Step 2: Consumer switches pact to /v2/classify
        Provider serves both → ✅
        Rollback: revert consumer, provider still serves both

Step 3: Provider removes /v1/classify
        No consumer references /v1 → can-i-deploy confirms → ✅
        Rollback: add /v1 back
```

Three PRs. Three green builds. Same principle as field evolution — expand, migrate, contract.

### When to Use Which

| Change | Pattern | Why |
|---|---|---|
| Field type change (`number` → `string`) | Field evolution | One field, additive is simple |
| Field rename (`confidence` → `score`) | Field evolution | Same as type change — add new, migrate, remove old |
| Add a new field | No pattern needed | Additive — just add it. Pact ignores extra fields |
| Remove a field | Field evolution (reverse) | Consumer stops asserting first, then provider removes |
| Multiple fields change at once | Endpoint versioning | Too many fields for additive — version the endpoint |
| Response structure changes (flat → nested) | Endpoint versioning | Shape change, not just field change |
| Endpoint semantics change | Endpoint versioning | Same URL, different behaviour — needs a new version |
| New endpoint added | No pattern needed | Additive — consumer writes pact, provider implements |

### How Engineers Feel About This

First reaction: "Four PRs to change a field type? That's insane."

After living through one coordinated breaking change (Slack blowing up at 4pm, rollbacks, incident review, three teams on a call): "Four PRs sounds fine."

The pattern feels heavy until you compare it to the alternative:
- 4 clean PRs over 2-3 days, each independently reviewable and rollback-safe
- vs 1 breaking change that requires skip flags, `continue-on-error`, multiple commits to clean up, and an incident log entry

The overhead is real but small. Each PR is a few lines — add a field, change an assertion, remove a field. The reviews are fast because the changes are obvious. The deploys are safe because each step is independently reversible.

### The Deprecation Problem

In practice, step 3 (removing the old field/endpoint) often never happens. The provider team says "it's not hurting anything" and moves on. Six months later you have 15 deprecated fields and 4 versioned endpoints that nobody removes.

Solutions used in real orgs:
- **Automated deprecation bot** — if no consumer pact asserts on a field for 90 days, a bot opens a PR to remove it
- **Deprecation headers** — provider returns `Deprecation: true` and `Sunset: <date>` headers on old endpoints. Monitoring alerts when consumers still call them after the sunset date
- **Pact Broker queries** — periodically query the Broker: "which fields in my response are NOT asserted on by any consumer?" Those are removal candidates
- **Tech debt sprints** — dedicated time to clean up deprecated fields. Boring but necessary

None of these are perfect. The deprecation bot is the closest to "set and forget" but requires investment to build. Most teams rely on discipline and periodic cleanup.

### When Expand and Contract Doesn't Apply

The one case where you can't use this pattern: **"it was always wrong, just fix it."**

If the original type was a genuine mistake (not a design decision that evolved), and both teams agree it should never have been that way, the additive approach creates a field that enshrines the mistake (`confidenceStr` implies the original `confidence` was intentionally different). In that case, use the emergency playbook above — break-glass, fix both sides, clean up Monday.

This should be rare. In a mature org, it happens maybe once or twice a year. If it's happening monthly, the problem isn't Pact — it's the API design process.

## Related Docs

- [break-glass.md](break-glass.md) — emergency deployment procedure
- [06-repo-separation.md](06-repo-separation.md) — monorepo vs multi-repo structural mapping
- [05-ci-cd-patterns.md](05-ci-cd-patterns.md) — CI/CD pipeline patterns
