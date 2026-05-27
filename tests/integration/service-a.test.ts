import { config } from './config'
import { CLASSIFY_PAYLOADS, EXPECTED_DATA, EXPECTED_HEALTH } from './fixtures/payloads'
import { createApiClient } from './utils/api-client'

const api = createApiClient(config.serviceA)

describe('Service A', () => {
  describe('GET /health', () => {
    it('returns healthy status', async () => {
      const response = await api.get('/health')

      expect(response.status).toBe(200)
      expect(response.data).toMatchObject(EXPECTED_HEALTH.serviceA)
    })
  })

  describe('GET /ready', () => {
    it('returns ready when Service B is reachable', async () => {
      const response = await api.get('/ready')

      expect(response.status).toBe(200)
      expect(response.data).toMatchObject({
        status: 'ready',
        service: 'service-a',
      })
    })
  })

  describe('GET /data', () => {
    it('returns downstream data from Service B', async () => {
      const response = await api.get('/data')

      expect(response.status).toBe(200)
      expect(response.data).toMatchObject({
        source: EXPECTED_DATA.source,
        downstream: expect.objectContaining({
          service: EXPECTED_DATA.downstream.service,
          data: EXPECTED_DATA.downstream.data,
        }),
      })
      expect(response.data.downstream.timestamp).toEqual(expect.any(Number))
    })
  })

  describe('POST /classify', () => {
    it('classifies valid text input', async () => {
      const response = await api.post('/classify', CLASSIFY_PAYLOADS.valid)

      expect(response.status).toBe(200)
      expect(response.data).toMatchObject({
        source: 'service-a',
        classification: {
          category: expect.any(String),
          confidence: expect.any(Number),
          model: expect.any(String),
        },
      })
    })

    it('returns 400 when text field is missing', async () => {
      const response = await api.post('/classify', CLASSIFY_PAYLOADS.missingField)

      expect(response.status).toBe(400)
      expect(response.data.error).toContain('text')
    })

    it('returns 400 when text field is empty', async () => {
      const response = await api.post('/classify', CLASSIFY_PAYLOADS.empty)

      expect(response.status).toBe(400)
      expect(response.data.error).toContain('text')
    })

    it('returns 400 when text field is wrong type', async () => {
      const response = await api.post('/classify', CLASSIFY_PAYLOADS.wrongType)

      expect(response.status).toBe(400)
      expect(response.data.error).toContain('text')
    })

    it('returns 400 when text field is null', async () => {
      const response = await api.post('/classify', CLASSIFY_PAYLOADS.nullField)

      expect(response.status).toBe(400)
      expect(response.data.error).toContain('text')
    })
  })

  describe('POST /agent', () => {
    it('returns agent response for valid message', async () => {
      const response = await api.post('/agent', { message: 'help me' })

      expect(response.status).toBe(200)
      expect(response.data).toMatchObject({
        source: 'service-a',
        agent: {
          response: expect.any(String),
          intent: expect.any(String),
          confidence: expect.any(Number),
        },
      })
    })

    it('returns 400 when message field is missing', async () => {
      const response = await api.post('/agent', {})

      expect(response.status).toBe(400)
      expect(response.data.error).toContain('message')
    })

    it('returns 400 when message field is empty', async () => {
      const response = await api.post('/agent', { message: '' })

      expect(response.status).toBe(400)
      expect(response.data.error).toContain('message')
    })

    it('returns 400 when message field is wrong type', async () => {
      const response = await api.post('/agent', { message: 42 })

      expect(response.status).toBe(400)
      expect(response.data.error).toContain('message')
    })
  })
})
