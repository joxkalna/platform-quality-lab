import http from 'http'
import { Verifier } from '@pact-foundation/pact'
import { app } from '../../../services/service-c/src/app'
import { StubbedIntegrations } from '../stubs'

describe('Pact Verification — service-c', () => {
  let server: http.Server
  const PORT = 8001
  const stubs = new StubbedIntegrations()

  beforeAll(() => {
    server = http.createServer(app)
    server.listen(PORT)
  })

  afterAll(() => {
    stubs.reset()
    server.close()
  })

  it('verifies pacts against service-c provider', async () => {
    const output = await new Verifier({
      provider: 'service-c',
      providerBaseUrl: `http://localhost:${PORT}`,
      pactBrokerUrl: process.env.PACT_BROKER_BASE_URL,
      pactBrokerToken: process.env.PACT_BROKER_TOKEN,
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
      logLevel: 'warn',
      stateHandlers: {
        'service-c is running': () => {
          stubs.start()
          return Promise.resolve()
        },
      },
      ...(process.env.PACT_URL ? { pactUrls: [process.env.PACT_URL] } : {}),
    }).verifyProvider()

    expect(output).toBeDefined()
  }, 30000)
})
