import { MatchersV3, PactV4 } from '@pact-foundation/pact'
import path from 'path'

const provider = new PactV4({
  consumer: 'service-a',
  provider: 'service-b',
  dir: path.resolve(__dirname, '../../pacts'),
})

describe('Service A → Service B', () => {
  it('expects GET /info to return service info', async () => {
    await provider
      .addInteraction()
      .given('service-b is running')
      .uponReceiving('a request for service info')
      .withRequest('GET', '/info')
      .willRespondWith(200, (builder) => {
        builder.headers({ 'Content-Type': 'application/json; charset=utf-8' })
        builder.jsonBody({
          service: MatchersV3.string('service-b'),
          timestamp: MatchersV3.number(1234567890),
          data: {
            version: MatchersV3.string('1.0.0'),
          },
        })
      })
      .executeTest(async (mockServer) => {
        // Call the real fetch logic Service A uses, pointed at the mock server
        const response = await fetch(`${mockServer.url}/info`)
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.service).toEqual(expect.any(String))
        expect(body.timestamp).toEqual(expect.any(Number))
        expect(body.data.version).toEqual(expect.any(String))
      })
  })
})
