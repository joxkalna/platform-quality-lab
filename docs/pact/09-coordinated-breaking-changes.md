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

## Prevention

Most "breaking changes" can be avoided with additive changes:

| Instead of | Do this |
|---|---|
| Change field type (`number` → `string`) | Add new field (`confidenceStr`), deprecate old one |
| Remove a field | Stop using it in consumers first, then remove from provider |
| Rename a field | Add new field, deprecate old one |
| Change response structure | Version the endpoint (`/v2/classify`) |

The scenario in this document — "it was always wrong, just fix it" — is the one case where additive changes don't apply. When the original type was a mistake, you fix the mistake. Pact's job is to make sure both sides agree on the fix before it reaches production.

## Related Docs

- [break-glass.md](break-glass.md) — emergency deployment procedure
- [06-repo-separation.md](06-repo-separation.md) — monorepo vs multi-repo structural mapping
- [05-ci-cd-patterns.md](05-ci-cd-patterns.md) — CI/CD pipeline patterns
