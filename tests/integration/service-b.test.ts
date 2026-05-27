import { config } from './config'
import { EXPECTED_HEALTH } from './fixtures/payloads'
import { createApiClient } from './utils/api-client'

const api = createApiClient(config.serviceB)

describe('Service B', () => {
  describe('GET /health', () => {
    it('returns healthy status', async () => {
      const response = await api.get('/health')

      expect(response.status).toBe(200)
      expect(response.data).toMatchObject(EXPECTED_HEALTH.serviceB)
    })
  })

  describe('GET /info', () => {
    it('returns service data with version and timestamp', async () => {
      const response = await api.get('/info')

      expect(response.status).toBe(200)
      expect(response.data).toMatchObject({
        service: 'service-b',
        data: { version: '1.0.0' },
      })
      expect(response.data.timestamp).toEqual(expect.any(Number))
    })
  })
})
