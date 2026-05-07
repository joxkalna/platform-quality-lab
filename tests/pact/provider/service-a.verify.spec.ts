import { Verifier } from '@pact-foundation/pact'
import http from 'http'
import { StubbedIntegrations } from '../stubs'

const SERVICE_B_URL = 'http://localhost:9001'
const SERVICE_C_URL = 'http://localhost:9002'

describe('Pact Verification — service-a', () => {
  let server: http.Server
  let stubs: StubbedIntegrations
  const PORT = 8002

  beforeAll(async () => {
    // Service A reads env vars at module load — must be set before import
    process.env.SERVICE_B_URL = SERVICE_B_URL
    process.env.SERVICE_C_URL = SERVICE_C_URL

    stubs = new StubbedIntegrations()
      .withServiceB(SERVICE_B_URL)
      .withServiceC(SERVICE_C_URL)
      .start()

    // Dynamic import required — app reads env vars at module load. Becomes static after app refactor.
    const { app } = await import('../../../services/service-a/src/app')
    server = http.createServer(app)
    server.listen(PORT)
  })

  afterAll(() => {
    server.close()
    stubs.reset()
  })

  it('verifies pacts against service-a provider', async () => {
    const output = await new Verifier({
      provider: 'service-a',
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
      ...(process.env.PACT_URL ? { pactUrls: [process.env.PACT_URL] } : {}),
    }).verifyProvider()

    expect(output).toBeDefined()
  }, 30000)
})
