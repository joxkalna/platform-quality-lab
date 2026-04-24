# Break-Glass Procedure — Emergency Deployments

## When to Use This

Use this procedure **only** when:
- A critical fix must be deployed immediately
- Pact contract tests are blocking the deployment
- Both consumer and provider teams have agreed the change is correct
- The cost of not deploying outweighs the risk of skipping contract verification

**This is not a shortcut for fixing broken contracts.** If you have time to fix the contract properly, do that instead. This procedure is for genuine emergencies — production is down, revenue is being lost, and the fix is blocked by a contract mismatch.

## Options (in order of preference)

### Option 1: Disable Pact via repository variable (fastest)

Set `PACT_ENABLED` to `false` in GitHub Actions repository variables:

**Settings → Secrets and variables → Actions → Variables → `PACT_ENABLED` = `false`**

The pact job is skipped entirely. Lint, typecheck, K8s validation, and deploy still run. The fix deploys without contract verification.

**After deploying:** Set `PACT_ENABLED` back to `true` (or delete the variable) to re-enable pact.

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

## After the Emergency

### Recovery (re-enabling Pact)

After the hotfix is deployed with pact disabled, the Broker is stale — it still has the old consumer pact marked as deployed. Recovery depends on your pipeline structure.

**Production pipeline (verification and deployment in separate stages):**

Recovery is a single commit:
1. Set `PACT_ENABLED` back to `true`
2. Consumer updates pact test to match the new reality
3. Verification fails against old deployed pact (expected) — but it's in the build stage, not blocking deploy
4. `can-i-deploy` passes, deploy runs, `record-deployment` updates the Broker
5. Next pipeline run: verification passes

**Our monorepo pipeline (everything in one job):**

Recovery requires two commits because verification failing blocks `record-deployment`:
1. Consumer updates pact test + `continue-on-error` on provider verification
2. Verification fails (expected), but pipeline continues to `record-deployment`
3. Second commit: remove `continue-on-error` — verification passes

See [09-coordinated-breaking-changes.md](09-coordinated-breaking-changes.md) → "The Friday-to-Monday Recovery" for the full exercise.

> **TODO:** Restructure the CI pipeline to separate verification from deployment recording. This matches the production pattern and eliminates the need for `continue-on-error` during recovery.

### Cleanup checklist

### Cleanup checklist

1. **Verify the contracts are correct** — run the full pipeline without any skips
2. **Publish the updated pact** — ensure the new consumer pact is on PactFlow
3. **Check PactFlow UI** — confirm all verification results are green
4. **Record the actual deployment** — if you used Option 2, verify the recorded version matches what's actually deployed
5. **Remove all workarounds** — `continue-on-error`, `PACT_ENABLED=false`, etc.
6. **Document what happened** — add a note to the incident log explaining why the break-glass was used

The `PACT_ENABLED` repository variable controls the pact job:

```yaml
pact:
  if: vars.PACT_ENABLED != 'false'
```

When set to `false`, the pact job is skipped. The deploy-and-test job still runs because it allows pact to be skipped:

```yaml
deploy-and-test:
  if: >-
    always() &&
    needs.lint.result == 'success' &&
    needs.typecheck.result == 'success' &&
    needs.validate-k8s.result == 'success' &&
    (needs.pact.result == 'success' || needs.pact.result == 'skipped')
```

When the emergency is over, set `PACT_ENABLED` back to `true` or delete the variable — the condition defaults to running pact when the variable doesn't exist.

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
