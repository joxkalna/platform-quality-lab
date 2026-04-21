import { MatchersV3, PactV4 } from '@pact-foundation/pact'
import path from 'path'

const serviceB = new PactV4({
  consumer: 'service-a',
  provider: 'service-b',
  dir: path.resolve(__dirname, '../../pacts'),
})

const serviceC = new PactV4({
  consumer: 'service-a',
  provider: 'service-c',
  dir: path.resolve(__dirname, '../../pacts'),
})

describe('Service A → Service B', () => {
  it('expects GET /info to return service info', async () => {
    await serviceB
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
        const response = await fetch(`${mockServer.url}/info`)
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.service).toEqual(expect.any(String))
        expect(body.timestamp).toEqual(expect.any(Number))
        expect(body.data.version).toEqual(expect.any(String))
      })
  })
})

describe('Service A → Service C', () => {
  it('expects POST /classify to return a classification', async () => {
    await serviceC
      .addInteraction()
      .given('service-c is running')
      .uponReceiving('a request to classify text')
      .withRequest('POST', '/classify', (builder) => {
        builder.headers({ 'Content-Type': 'application/json' })
        builder.jsonBody({ text: MatchersV3.string('server is down and unresponsive') })
      })
      .willRespondWith(200, (builder) => {
        builder.headers({ 'Content-Type': 'application/json; charset=utf-8' })
        builder.jsonBody({
          category: MatchersV3.string('critical'),
          confidence: MatchersV3.string('0.95'),
          model: MatchersV3.string('llama3.2:1b'),
        })
      })
      .executeTest(async (mockServer) => {
        const response = await fetch(`${mockServer.url}/classify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'server is down and unresponsive' }),
        })
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.category).toEqual(expect.any(String))
        expect(body.confidence).toEqual(expect.any(String))
        expect(body.model).toEqual(expect.any(String))
      })
  })
})
