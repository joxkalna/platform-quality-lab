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

const infoResponse = {
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: {
    service: MatchersV3.string('service-b'),
    timestamp: MatchersV3.number(1234567890),
    data: {
      version: MatchersV3.string('1.0.0'),
    },
  },
}

const classifyRequest = {
  headers: { 'Content-Type': 'application/json' },
  body: { text: MatchersV3.string('server is down and unresponsive') },
}

const classifyResponse = {
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: {
    category: MatchersV3.string('critical'),
    confidence: MatchersV3.decimal(0.95),
    model: MatchersV3.string('llama3.2:1b'),
  },
}

describe('Service A → Service B', () => {
  it('expects GET /info to return service info', async () => {
    await serviceB
      .addInteraction()
      .given('service-b is running')
      .uponReceiving('a request for service info')
      .withRequest('GET', '/info')
      .willRespondWith(200, (builder) => {
        builder.headers(infoResponse.headers)
        builder.jsonBody(infoResponse.body)
      })
      .executeTest(async (mockServer) => {
        const response = await fetch(`${mockServer.url}/info`, {
          signal: AbortSignal.timeout(5000),
        })
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
        builder.headers(classifyRequest.headers)
        builder.jsonBody(classifyRequest.body)
      })
      .willRespondWith(200, (builder) => {
        builder.headers(classifyResponse.headers)
        builder.jsonBody(classifyResponse.body)
      })
      .executeTest(async (mockServer) => {
        const response = await fetch(`${mockServer.url}/classify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'server is down and unresponsive' }),
          signal: AbortSignal.timeout(5000),
        })
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.category).toEqual(expect.any(String))
        expect(body.confidence).toEqual(expect.any(Number))
        expect(body.model).toEqual(expect.any(String))
      })
  })
})
