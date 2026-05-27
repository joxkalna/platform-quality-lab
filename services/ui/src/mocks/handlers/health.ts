import { http, HttpResponse } from 'msw'

import { HEALTH_DOWN_RESPONSE, HEALTH_RESPONSES } from './health.mocks'

export const healthHandlers = [
  http.get('/api/health', () => {
    return HttpResponse.json(HEALTH_RESPONSES.a)
  }),
  http.get('/api-b/health', () => {
    return HttpResponse.json(HEALTH_RESPONSES.b)
  }),
  http.get('/api-c/health', () => {
    return HttpResponse.json(HEALTH_RESPONSES.c)
  }),
]

export const healthServiceDownHandler = (service: 'a' | 'b' | 'c') => {
  const paths = { a: '/api/health', b: '/api-b/health', c: '/api-c/health' } as const
  return http.get(paths[service], () => {
    return HttpResponse.json(HEALTH_DOWN_RESPONSE(service), { status: 503 })
  })
}
