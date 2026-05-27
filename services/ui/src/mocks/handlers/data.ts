import { http, HttpResponse } from 'msw'

import { DATA_ERROR_RESPONSE, DATA_SUCCESS_RESPONSE } from './data.mocks'

export const dataHandlers = [
  http.get('/api/data', () => {
    return HttpResponse.json({
      ...DATA_SUCCESS_RESPONSE,
      downstream: {
        ...DATA_SUCCESS_RESPONSE.downstream,
        timestamp: Date.now(),
      },
    })
  }),
]

export const dataErrorHandler = http.get('/api/data', () => {
  return HttpResponse.json(DATA_ERROR_RESPONSE, { status: 502 })
})
