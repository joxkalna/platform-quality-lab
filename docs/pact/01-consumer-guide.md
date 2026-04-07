# Consumer Guide

## What is a Consumer?

A consumer is any service that makes an HTTP request to another service (the provider). In Pact, the consumer defines the contract.

## How Consumer Testing Works

1. Write a test that describes the request you make and the response you expect
2. Pact intercepts the HTTP call with a mock server
3. If the test passes, Pact generates a **pact file** (the contract)
4. The pact file is published to the Pact Broker

## Writing a Consumer Test

Regardless of language, every consumer test follows the same pattern:

1. **Declare the interaction** — define the HTTP request and expected response
2. **Execute your code** — call the method that makes the real HTTP request, pointed at the Pact mock server
3. **Assert the result** — verify your code handles the response correctly
4. **Generate the pact** — the framework writes the pact file automatically on success

### Example Interaction (pseudocode)

```
interaction:
  description: "a request for user 123"
  request:
    method: GET
    path: /users/123
  response:
    status: 200
    body:
      id: 123
      name: "any string"
```

## Publishing to the Pact Broker

After tests pass and the pact file is generated, publish it to the Broker:

```bash
pact-broker publish ./pacts \
  --broker-base-url https://<broker-url> \
  --broker-username <username> \
  --broker-password <password> \
  --consumer-app-version <git-sha> \
  --branch <branch-name>
```

Key flags:
- `--consumer-app-version` — use the git SHA so every version is traceable
- `--branch` — tags the pact with the branch name for environment-aware deployments

## What Goes in the Pact File

The generated JSON contains:

- **Consumer name** — who is making the request
- **Provider name** — who is expected to respond
- **Interactions** — list of request/response pairs
- **Metadata** — Pact specification version

You should never edit a pact file manually. It is always generated from tests.

## Best Practices

- Test only what your consumer actually uses — don't assert on fields you ignore
- Use matchers (e.g. `any string`, `any integer`) instead of exact values where possible
- Keep interactions small and focused — one interaction per scenario
- Always publish with a git SHA as the version, not a semantic version
- Publish from CI, not locally

## Common Mistakes

- **Over-specifying responses** — asserting on every field makes contracts brittle
- **Not publishing from CI** — local publishes lead to inconsistent versions
- **Sharing pact files via git** — always use the Broker as the single source of truth
- **Testing provider logic** — consumer tests verify the contract, not the provider's business rules

## Next Steps

Once your pact is published, the provider needs to verify it. See [02-provider-verification.md](./02-provider-verification.md).
