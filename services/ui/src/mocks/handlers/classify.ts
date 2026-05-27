import { http, HttpResponse, delay } from 'msw'

import {
  CLASSIFY_ERROR_RESPONSE,
  CLASSIFY_SLOW_RESPONSE,
  CLASSIFY_SUCCESS_RESPONSE,
  CLASSIFY_VALIDATION_ERROR,
} from './classify.mocks'

function isValidBody(body: unknown): body is { text: string } {
  return (
    typeof body === 'object' &&
    body !== null &&
    'text' in body &&
    typeof (body as { text: unknown }).text === 'string' &&
    (body as { text: string }).text.length > 0
  )
}

export const classifyHandlers = [
  http.post('/api/classify', async ({ request }) => {
    const body: unknown = await request.json()

    if (!isValidBody(body)) {
      return HttpResponse.json(CLASSIFY_VALIDATION_ERROR, { status: 400 })
    }

    return HttpResponse.json(CLASSIFY_SUCCESS_RESPONSE)
  }),
]

export const classifySlowHandler = http.post('/api/classify', async () => {
  await delay(5000)
  return HttpResponse.json(CLASSIFY_SLOW_RESPONSE)
})

export const classifyErrorHandler = http.post('/api/classify', () => {
  return HttpResponse.json(CLASSIFY_ERROR_RESPONSE, { status: 502 })
})

export const classifyNetworkErrorHandler = http.post(
  '/api/classify',
  () => HttpResponse.error(),
)
