# Break-Glass Procedure — Emergency Deployments

## When to Use This

Use this procedure **only** when:
- A critical fix must be deployed immediately
- Pact contract tests are blocking the deployment
- Both consumer and provider teams have agreed the change is correct
- The cost of not deploying outweighs the risk of skipping contract verification

**This is not a shortcut for fixing broken contracts.** If you have time to fix the contract properly, do that instead. This procedure is for genuine emergencies — production is down, revenue is being lost, and the fix is blocked by a contract mismatch.

## Options (in order of preference)

### Option 1: Skip Pact in CI (fastest)

Add `[skip pact]` to the commit message:

```bash
git commit -m "fix: critical response format change [skip pact]"
```

The pact job is skipped entirely. Lint, typecheck, K8s validation, and deploy still run. The fix deploys without contract verification.

**After deploying:** Run the pipeline again without `[skip pact]` to verify contracts are correct and publish the updated pact to the Broker.

### Option 2: Force-record deployment on the Broker

Tell PactFlow that the new version is already deployed, before it actually is. This makes `can-i-deploy` check against the new version instead of the old one.

```bash
# Get the commit SHA of the fix
COMMIT=$(git rev-parse --short=8 HEAD)

# Force-record both services as deployed
npx pact-broker record-deployment \
  --pacticipant service-a --version "$COMMIT" --environment prod \
  --broker-base-url "$PACT_BROKER_BASE_URL" --broker-token "$PACT_BROKER_TOKEN"

npx pact-broker record-deployment \
  --pacticipant service-c --version "$COMMIT" --environment prod \
  --broker-base-url "$PACT_BROKER_BASE_URL" --broker-token "$PACT_BROKER_TOKEN"
```

Now push the fix. Provider verification may still fail against the old deployed pact, but `can-i-deploy` will pass because the "deployed" version is now the new one.

**Risk:** If the fix is wrong, PactFlow thinks it's deployed when it isn't. Clean up by recording the actual deployed version after the real deployment.

### Option 3: Allow provider verification to fail (monorepo only)

For monorepo breaking changes where both sides change in one commit, allow provider verification to fail but rely on `can-i-deploy` (same-commit check) as the gate:

```yaml
- name: Run provider verification
  continue-on-error: true
  run: npm run test:pact:verify
```

The verification results are still published to PactFlow (so you can see what failed), but the pipeline continues to `can-i-deploy` which checks both services at the same commit.

**When to use:** Coordinated breaking changes in a monorepo where both consumer and provider are updated together.

## After the Emergency

1. **Verify the contracts are correct** — run the full pipeline without any skips
2. **Publish the updated pact** — ensure the new consumer pact is on PactFlow
3. **Check PactFlow UI** — confirm all verification results are green
4. **Record the actual deployment** — if you used Option 2, verify the recorded version matches what's actually deployed
5. **Document what happened** — add a note to the incident log explaining why the break-glass was used

## How This Works in CI

The `[skip pact]` flag is checked in the pact job condition:

```yaml
pact:
  if: "!contains(github.event.head_commit.message, '[skip pact]')"
```

When skipped, the deploy-and-test job still runs because it allows pact to be skipped:

```yaml
deploy-and-test:
  if: >-
    always() &&
    needs.lint.result == 'success' &&
    needs.typecheck.result == 'success' &&
    needs.validate-k8s.result == 'success' &&
    (needs.pact.result == 'success' || needs.pact.result == 'skipped')
```

## In a Real Org

The shared CI pipeline typically uses a `PACT_TESTING` variable:

```yaml
variables:
  PACT_TESTING: "true"  # set to "false" to skip all pact jobs
```

All pact jobs check this flag:

```yaml
pact_test:
  rules:
    - if: "$PACT_TESTING == 'true'"
```

To skip pact in an emergency, change the variable to `"false"` in the CI config or pass it as a pipeline variable override. No code change needed — just a CI variable toggle.

Some orgs also have a dedicated "hotfix" branch pattern that skips non-essential CI gates (pact, load tests, chaos) while keeping critical gates (lint, typecheck, security scan).
