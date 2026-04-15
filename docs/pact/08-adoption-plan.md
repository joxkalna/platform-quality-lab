# Adoption Plan — From Zero to Working Pact

## Purpose

This is a concrete, step-by-step plan for adopting Pact contract testing in an organisation. It assumes multiple environments (dev, qa, prod) and is written so that any engineer or AI assistant can follow it from start to finish.

Each phase builds on the previous one. Don't skip ahead — the order matters.

## Prerequisites

Before starting:

- [ ] At least 2 services that communicate over HTTP (one will be the consumer, one the provider)
- [ ] Both services have CI/CD pipelines that deploy to multiple environments (dev, qa, prod)
- [ ] Docker available (for running the Pact Broker)
- [ ] IaC tooling available (Terraform, CDK, K8s manifests — whatever the org uses)
- [ ] A container registry to host the Broker image
- [ ] A secrets store for Broker credentials (Vault, cloud-native, etc.)

## Choosing Your First Pair

Before building anything, you need to pick which consumer and provider to start with. This choice matters — a bad first pair can stall adoption before it starts.

### What you're looking for

The ideal first pair is:

- **Simple API surface** — a handful of endpoints, not 50. You want to prove the workflow, not boil the ocean
- **Stable contract** — the API isn't changing every sprint. A volatile API means you're debugging contract changes instead of learning the tooling
- **Willing teams** — both the consumer and provider teams are interested (or at least not hostile). Pact requires both sides to participate
- **Already working** — both services are deployed and communicating successfully. You're codifying an existing contract, not designing a new one
- **Good test coverage** — the teams already write tests. Adding pact tests is an extension of existing habits, not a culture change
- **Owned by the same team (ideally)** — for the first pair, having one team own both sides removes the coordination overhead. You learn the tooling without the politics

### What to avoid for the first pair

- **High-traffic critical path** — if the first pact setup has a bug, you don't want it blocking your checkout flow
- **Legacy services with no tests** — adding contract tests to a service that has no tests is two culture changes at once
- **Services with dozens of consumers** — start with a 1:1 relationship, not 1:many
- **Services mid-rewrite** — the contract is about to change anyway
- **Teams that are already overloaded** — they'll deprioritise pact work and it'll stall

### How to evaluate candidates

Map out your service dependencies. For each consumer-provider pair, score against:

| Criteria | Ideal | Avoid |
|---|---|---|
| Number of endpoints used | 1–5 | 20+ |
| API change frequency | Rarely | Every sprint |
| Team willingness | Enthusiastic or curious | Resistant or overloaded |
| Existing test coverage | Good | None |
| Number of consumers | 1 | 10+ |
| Criticality | Medium | Mission-critical |
| Ownership | Same team owns both | Different orgs |

You don't need a perfect score. You need a pair where the risk of failure is low and the team has bandwidth to learn.

### The decision process

1. **List all service-to-service HTTP dependencies** — draw them out or pull from existing architecture diagrams
2. **Filter to pairs where one team owns both sides** (or two teams that work closely together)
3. **Filter to pairs with a small, stable API surface**
4. **Pick the one where the team is most willing** — enthusiasm beats technical perfection
5. **Confirm the provider's API is already working in all environments** — you need a known-good commit for initialisation

### Common mistake: picking by complexity

It's tempting to pick the most complex or most painful integration — "this is where we have the most bugs, so this is where contract testing will help most." That's true long-term, but the first pair should be easy. You're proving the workflow and building confidence. Pick the complex one second.

### Example thought process

> "We have 15 services. Service X calls Service Y on 3 endpoints — it's stable, both are owned by Team Alpha, and they already have good test coverage. Service Z calls Service W on 30 endpoints and breaks every release — that's where we need contract testing most, but it's a terrible first candidate because the scope is huge and the API is volatile. Start with X→Y, learn the workflow, then tackle Z→W."

---

## Phase 1: Broker Infrastructure

**Goal:** A running Pact Broker accessible by CI pipelines.

### Steps

1. **Create a broker infrastructure repo** (`infra-pact-broker` or similar)

2. **Provision the Broker:**
   - Container running `pactfoundation/pact-broker` (pin the version)
   - Managed Postgres database as the backing store
   - Load balancer in front of the container
   - DNS record (e.g. `pact-broker.internal.example.io`)

3. **Create two sets of credentials:**
   - Automation user (read-write) — used by CI pipelines
   - Read-only user — for browsing the Broker UI
   - Store both in the secrets store, never in code

4. **Register environments on the Broker:**
   ```bash
   pact-broker create-environment --name dev --broker-base-url "$PACT_BROKER_URL" ...
   pact-broker create-environment --name qa --broker-base-url "$PACT_BROKER_URL" ...
   pact-broker create-environment --name prod --broker-base-url "$PACT_BROKER_URL" ...
   ```

5. **Verify the Broker is healthy:**
   ```bash
   curl https://pact-broker.internal.example.io/diagnostic/status/heartbeat
   # → 200 OK
   ```

### Done when

- [ ] Broker is running and accessible from CI
- [ ] Environments registered (dev, qa, prod)
- [ ] Credentials stored in secrets store
- [ ] Broker UI accessible via read-only credentials

### References

- [04-broker-ops.md](./04-broker-ops.md) — Broker setup, credentials, upgrades
- [06-repo-separation.md](./06-repo-separation.md#1-broker-infrastructure-repo) — what goes in the broker repo

---

## Phase 2: First Provider

**Goal:** The provider is registered with the Broker and has a green baseline in all environments.

Pick the provider service first. This is the service that serves the API — the one that will be verified against consumer contracts.

### Steps

1. **Choose a known-good commit** — a version of the provider that is currently deployed and working in all environments. Get its short SHA (8 chars):
   ```bash
   git rev-parse --short=8 HEAD
   # → e.g. abc12345
   ```

2. **Initialise the provider on the Broker:**
   ```bash
   # Register the provider
   pact-broker create-or-update-version \
     --broker-base-url "$PACT_BROKER_URL" \
     --broker-username "$PACT_BROKER_USERNAME" \
     --broker-password "$PACT_BROKER_PASSWORD" \
     --pacticipant "my-provider-service" \
     --version "abc12345" \
     --branch "main"

   # Record it as deployed to every environment
   for env in dev qa prod; do
     pact-broker record-deployment \
       --broker-base-url "$PACT_BROKER_URL" \
       --broker-username "$PACT_BROKER_USERNAME" \
       --broker-password "$PACT_BROKER_PASSWORD" \
       --pacticipant "my-provider-service" \
       --version "abc12345" \
       --environment "$env"
   done
   ```

3. **Add provider verification to the provider's CI pipeline:**
   ```
   build and test          pre-deploy         deploy          post-deploy
   ──────────────          ──────────         ──────          ───────────
   pact:verify        →    can-i-deploy  →    deploy     →    record-deployment
   ```

   The verification step fetches pacts from the Broker and verifies them against the running provider. At this point there are no pacts yet, so it will pass with "no pacts found" — that's expected.

4. **Write the provider verification test:**
   ```typescript
   // tests/pact/provider/verify.spec.ts
   import { Verifier } from '@pact-foundation/pact'

   describe('Pact Verification', () => {
     it('verifies pacts', async () => {
       const output = await new Verifier({
         provider: 'my-provider-service',
         providerBaseUrl: 'http://localhost:8000',
         pactBrokerUrl: process.env.PACT_BROKER_URL,
         pactBrokerUsername: process.env.PACT_BROKER_USERNAME,
         pactBrokerPassword: process.env.PACT_BROKER_PASSWORD,
         publishVerificationResult: process.env.CI === 'true',
         providerVersion: process.env.GIT_SHORT_SHA,
         providerVersionBranch: process.env.GIT_BRANCH,
         consumerVersionSelectors: [
           { mainBranch: true },
           { deployedOrReleased: true },
           { matchingBranch: true },
         ],
         enablePending: true,
         failIfNoPactsFound: false,
       }).verifyProvider()

       expect(output).toBeDefined()
     }, 30000)
   })
   ```

   Key settings:
   - `failIfNoPactsFound: false` — so the pipeline doesn't fail before any consumer publishes
   - `enablePending: true` — new pacts don't break the provider pipeline until verified
   - `publishVerificationResult` only in CI — don't pollute the Broker with local results

5. **Add `can-i-deploy` and `record-deployment` to the provider's deploy pipeline:**
   ```bash
   # Before deploying to each environment
   pact-broker can-i-deploy \
     --pacticipant "my-provider-service" \
     --version "$GIT_SHORT_SHA" \
     --to-environment "$ENV" \
     --broker-base-url "$PACT_BROKER_URL" ...

   # After successful deploy
   pact-broker record-deployment \
     --pacticipant "my-provider-service" \
     --version "$GIT_SHORT_SHA" \
     --environment "$ENV" \
     --broker-base-url "$PACT_BROKER_URL" ...
   ```

   Only `record-deployment` on the protected main branch, not feature branches.

### Done when

- [ ] Provider registered on the Broker with a version
- [ ] Deployments recorded for all environments
- [ ] Provider pipeline has: verify → can-i-deploy → deploy → record-deployment
- [ ] Pipeline is green (no pacts to verify yet, that's fine)

### References

- [02-provider-verification.md](./02-provider-verification.md) — verification test patterns
- [03-provider-initialisation.md](./03-provider-initialisation.md) — initialisation details

---

## Phase 3: First Consumer

**Goal:** The consumer publishes a pact, the provider verifies it, and both pipelines gate on `can-i-deploy`.

Pick the consumer service. This is the service that makes HTTP requests to the provider.

### Steps

1. **Write the consumer pact test:**

   The first pact must describe what the provider **already returns** — you're codifying the current contract, not designing a new one.

   ```typescript
   // tests/pact/consumer/my-provider.pact.spec.ts
   import { PactV4, MatchersV3 } from '@pact-foundation/pact'

   const provider = new PactV4({
     consumer: 'my-consumer-service',
     provider: 'my-provider-service',
   })

   describe('My Provider', () => {
     it('returns data', async () => {
       await provider
         .addInteraction()
         .given('data exists')
         .uponReceiving('a request for data')
         .withRequest('GET', '/api/data')
         .willRespondWith(200, (builder) => {
           builder.jsonBody(
             MatchersV3.like({ id: 1, name: 'example' })
           )
         })
         .executeTest(async (mockServer) => {
           // Call your REAL client code, pointed at the mock server
           const result = await myApiClient.getData(mockServer.url)
           expect(result).toEqual({ id: expect.any(Number), name: expect.any(String) })
         })
     })
   })
   ```

   Key points:
   - Use `MatchersV3.like()` — matches on type, not exact value. Adding new fields won't break the contract
   - Call your real client code, not a reimplementation
   - The provider name must match exactly what was registered in Phase 2

2. **Run the consumer test locally:**
   ```bash
   npm run test:pact
   ```
   This generates a pact JSON file (e.g. `pacts/my-consumer-service-my-provider-service.json`).

3. **Add pact steps to the consumer's CI pipeline:**
   ```
   build and test                    pre-deploy         deploy          post-deploy
   ──────────────                    ──────────         ──────          ───────────
   pact:test → pact:publish    →    can-i-deploy  →    deploy     →    record-deployment
   ```

   ```bash
   # Publish the pact to the Broker
   pact-broker publish ./pacts \
     --broker-base-url "$PACT_BROKER_URL" \
     --broker-username "$PACT_BROKER_USERNAME" \
     --broker-password "$PACT_BROKER_PASSWORD" \
     --consumer-app-version "$GIT_SHORT_SHA" \
     --branch "$GIT_BRANCH"

   # Before deploying to each environment
   pact-broker can-i-deploy \
     --pacticipant "my-consumer-service" \
     --version "$GIT_SHORT_SHA" \
     --to-environment "$ENV" \
     --broker-base-url "$PACT_BROKER_URL" ...

   # After successful deploy
   pact-broker record-deployment \
     --pacticipant "my-consumer-service" \
     --version "$GIT_SHORT_SHA" \
     --environment "$ENV" \
     --broker-base-url "$PACT_BROKER_URL" ...
   ```

4. **Trigger the provider pipeline** — the provider needs to verify the newly published pact. At this stage (no webhooks), just re-run the provider pipeline manually or wait for its next commit.

5. **Verify end-to-end:**
   - Broker UI shows the consumer pact
   - Provider verification result is green
   - `can-i-deploy` passes for both services
   - Both pipelines deploy through dev → qa → prod

### Done when

- [ ] Consumer pact test passes locally
- [ ] Pact published to Broker
- [ ] Provider verifies the pact successfully
- [ ] Both pipelines gate on `can-i-deploy` before each environment
- [ ] Both pipelines run `record-deployment` after each deploy
- [ ] Broker UI shows green verification status

### References

- [01-consumer-guide.md](./01-consumer-guide.md) — consumer test patterns
- [05-ci-cd-patterns.md](./05-ci-cd-patterns.md) — CI/CD pipeline patterns

---

## Phase 4: Webhooks

**Goal:** Consumer pact changes automatically trigger provider verification — no manual re-runs.

Without webhooks, the provider only verifies pacts when its own pipeline runs. This means a consumer can publish a breaking pact and not find out until the provider's next commit — which could be hours or days later.

### Steps

1. **Create a webhook on the Broker:**
   ```bash
   pact-broker create-or-update-webhook \
     "<provider-ci-trigger-url>" \
     --broker-base-url "$PACT_BROKER_URL" \
     --broker-username "$PACT_BROKER_USERNAME" \
     --broker-password "$PACT_BROKER_PASSWORD" \
     --provider "my-provider-service" \
     --description "my-provider-service verification trigger" \
     --contract_requiring_verification_published \
     -X POST
   ```

   The `--contract_requiring_verification_published` event fires when:
   - A consumer publishes a new or changed pact that hasn't been verified
   - A new provider version exists that hasn't verified an existing pact

   It does **not** fire when a consumer republishes an identical pact — avoiding unnecessary pipeline runs.

2. **Configure the provider pipeline to handle webhook triggers:**

   When triggered by a webhook, the pipeline receives a `PACT_URL` variable pointing to the specific pact to verify. The provider verification test should detect this:

   ```typescript
   const options: VerifierOptions = {
     provider: 'my-provider-service',
     providerBaseUrl: 'http://localhost:8000',
     // ... other options
   }

   // Webhook-triggered: verify the specific pact
   if (process.env.PACT_URL) {
     options.pactUrls = [process.env.PACT_URL]
   }
   // Regular build: fetch all pacts from broker
   ```

3. **Test the webhook:**
   ```bash
   pact-broker test-webhook \
     --uuid "<webhook-id>" \
     --broker-base-url "$PACT_BROKER_URL" ...
   ```

### Done when

- [ ] Webhook created on the Broker
- [ ] Consumer publishes a pact → provider pipeline auto-triggers
- [ ] Provider verifies the specific pact from the webhook
- [ ] Results published back to the Broker

### References

- [03-provider-initialisation.md](./03-provider-initialisation.md#step-4-create-the-webhook) — webhook creation details

---

## Phase 5: Scale to More Teams

**Goal:** Onboard additional consumers and providers without the platform team being a bottleneck.

### Steps

1. **Create a provider initialisation script or repo** — a reusable tool that any team can run to register their provider with the Broker. See [03-provider-initialisation.md](./03-provider-initialisation.md).

2. **Consider a CLI wrapper** — if teams are copy-pasting the same `pact-broker` commands with the same flags, wrap them in a CLI that bakes in org defaults (broker URL, retry logic, environment mapping):
   ```bash
   npx @myorg/pact-cli can-i-deploy --service my-service --env qa
   npx @myorg/pact-cli record-deployment --service my-service --env qa
   ```

3. **Consider a shared provider library** — if multiple providers are duplicating the same Verifier config, extract it into a shared package. See [06-repo-separation.md](./06-repo-separation.md#3-shared-provider-library-repo).

4. **Create golden example repos** — maintain working consumer and provider repos that teams can reference. Not templates — real repos with passing pipelines.

5. **Spread knowledge peer-to-peer** — the team that just onboarded teaches the next team. Lunch-and-learns, pairing sessions, a shared Slack channel.

### Done when

- [ ] A second consumer-provider pair is onboarded without platform team hand-holding
- [ ] Onboarding a new provider takes less than a day
- [ ] Teams can troubleshoot their own pact failures

### References

- [06-repo-separation.md](./06-repo-separation.md) — multi-repo structure
- [07-adoption-at-scale.md](./07-adoption-at-scale.md) — adoption strategies and trade-offs

---

## Making Changes to Contracts

Once everything is wired up, here's how contract changes work:

### Adding a new field (backwards-compatible)

Provider goes first:
1. Provider adds the field to its API
2. Provider pipeline runs → verification passes (existing contract doesn't mention the new field)
3. Provider merges and deploys
4. Consumer updates its pact test to include the new field
5. Consumer publishes updated pact → provider verifies → both deploy

### Removing a field or changing a type (breaking change)

Consumer goes first:
1. Consumer updates its pact test to remove/change the expectation
2. Consumer publishes updated pact → provider verifies the new contract passes
3. Provider makes the breaking change
4. Both merge and deploy

### Key rule

If a change breaks an existing contract, discuss it as a team first. Consider whether the API should be versioned (V2), use a feature flag, or whether the breaking change is truly necessary.

---

## Quick Reference — What Each Pipeline Needs

### Consumer pipeline

```
test → pact:test → pact:publish → can-i-deploy → deploy → record-deployment
```

### Provider pipeline

```
test → pact:verify → can-i-deploy → deploy → record-deployment
```

### One-time per provider

```
create-or-update-version → record-deployment (all envs) → create-webhook
```

### One-time for the org

```
deploy broker → register environments (dev, qa, prod)
```

---

## Checklist — Full Adoption

- [ ] **Broker** running and accessible from CI
- [ ] **Environments** registered (dev, qa, prod)
- [ ] **First provider** initialised with green baseline in all environments
- [ ] **First consumer** publishing pacts and gating on `can-i-deploy`
- [ ] **Provider verification** passing and publishing results
- [ ] **Both pipelines** running `record-deployment` after each deploy (main branch only)
- [ ] **Webhook** auto-triggering provider verification on new pacts
- [ ] **Second pair** onboarded without platform team hand-holding
- [ ] **Knowledge spreading** — teams can troubleshoot their own failures

## Further Reading

- [Pact Nirvana — the recommended CI/CD maturity model](https://docs.pact.io/pact_nirvana)
- [00-big-picture.md](./00-big-picture.md) — how all the pieces fit together
- [07-adoption-at-scale.md](./07-adoption-at-scale.md) — strategies for large org adoption
