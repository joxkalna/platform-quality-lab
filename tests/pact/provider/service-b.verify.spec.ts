import http from 'http'
import { Verifier } from '@pact-foundation/pact'
import { app } from '../../../services/service-b/src/index'

describe('Pact Verification — service-b', () => {
  let server: http.Server
  const PORT = 8000

  beforeAll(() => {
    server = http.createServer(app)
    server.listen(PORT)
  })

  afterAll(() => {
    server.close()
  })

  it('verifies pacts against service-b provider', async () => {
    const output = await new Verifier({
      provider: 'service-b',
      providerBaseUrl: `http://localhost:${PORT}`,
      pactBrokerUrl: process.env.PACT_BROKER_URL || 'http://localhost:30080',
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
      logLevel: 'warn',
      // Webhook-triggered: verify the specific pact
      ...(process.env.PACT_URL ? { pactUrls: [process.env.PACT_URL] } : {}),
    }).verifyProvider()

    expect(output).toBeDefined()
  }, 30000)
})
