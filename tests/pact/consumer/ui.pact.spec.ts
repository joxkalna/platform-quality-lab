import { MatchersV3, PactV4 } from '@pact-foundation/pact'
import path from 'path'

const serviceA = new PactV4({
  consumer: 'ui',
  provider: 'service-a',
  dir: path.resolve(__dirname, '../../pacts'),
})

const classifyRequest = {
  method: 'POST' as const,
  path: '/classify',
  headers: { 'Content-Type': 'application/json' },
  body: { text: MatchersV3.string('server is down') },
}

const classifyResponse = {
  status: 200,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: {
    source: MatchersV3.string('service-a'),
    classification: {
      category: MatchersV3.string('critical'),
      confidence: MatchersV3.decimal(0.92),
      model: MatchersV3.string('llama3.2:1b'),
    },
  },
}

const dataResponse = {
  status: 200,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: {
    source: MatchersV3.string('service-a'),
    downstream: {
      service: MatchersV3.string('service-b'),
      timestamp: MatchersV3.number(1234567890),
      data: {
        version: MatchersV3.string('1.0.0'),
      },
    },
  },
}

describe('UI → Service A', () => {
  it('expects POST /classify to return a wrapped classification', async () => {
    await serviceA
      .addInteraction()
      .given('service-a is running with service-c available')
      .uponReceiving('a classify request from the UI')
      .withRequest(classifyRequest.method, classifyRequest.path, (builder) => {
        builder.headers(classifyRequest.headers)
        builder.jsonBody(classifyRequest.body)
      })
      .willRespondWith(classifyResponse.status, (builder) => {
        builder.headers(classifyResponse.headers)
        builder.jsonBody(classifyResponse.body)
      })
      .executeTest(async (mockServer) => {
        const response = await fetch(`${mockServer.url}/classify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'server is down' }),
          signal: AbortSignal.timeout(5000),
        })
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.source).toEqual(expect.any(String))
        expect(body.classification.category).toEqual(expect.any(String))
        expect(body.classification.confidence).toEqual(expect.any(Number))
        expect(body.classification.model).toEqual(expect.any(String))
      })
  })

  it('expects GET /data to return downstream service info', async () => {
    await serviceA
      .addInteraction()
      .given('service-a is running with service-b available')
      .uponReceiving('a data request from the UI')
      .withRequest('GET', '/data')
      .willRespondWith(dataResponse.status, (builder) => {
        builder.headers(dataResponse.headers)
        builder.jsonBody(dataResponse.body)
      })
      .executeTest(async (mockServer) => {
        const response = await fetch(`${mockServer.url}/data`, {
          signal: AbortSignal.timeout(5000),
        })
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.source).toEqual(expect.any(String))
        expect(body.downstream.service).toEqual(expect.any(String))
        expect(body.downstream.timestamp).toEqual(expect.any(Number))
        expect(body.downstream.data.version).toEqual(expect.any(String))
      })
  })
})
