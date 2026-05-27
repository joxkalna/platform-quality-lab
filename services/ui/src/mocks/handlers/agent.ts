import { http, HttpResponse, delay } from 'msw'

import {
  AGENT_ERROR_RESPONSE,
  AGENT_VALIDATION_ERROR,
  DEFAULT_RESPONSE,
  INTENT_MAP,
} from './agent.mocks'

function isValidBody(body: unknown): body is { message: string } {
  return (
    typeof body === 'object' &&
    body !== null &&
    'message' in body &&
    typeof (body as { message: unknown }).message === 'string' &&
    (body as { message: string }).message.length > 0
  )
}

function matchIntent(message: string) {
  const lower = message.toLowerCase()
  for (const [keyword, result] of Object.entries(INTENT_MAP)) {
    if (lower.includes(keyword)) return result
  }
  return DEFAULT_RESPONSE
}

export const agentHandlers = [
  http.post('/api/agent', async ({ request }) => {
    const body: unknown = await request.json()

    if (!isValidBody(body)) {
      return HttpResponse.json(AGENT_VALIDATION_ERROR, { status: 400 })
    }

    return HttpResponse.json({
      source: 'service-a',
      agent: matchIntent(body.message),
    })
  }),
]

export const agentSlowHandler = http.post('/api/agent', async ({ request }) => {
  const body: unknown = await request.json()
  await delay(5000)
  const message = isValidBody(body) ? body.message : ''
  return HttpResponse.json({
    source: 'service-a',
    agent: matchIntent(message),
  })
})

export const agentErrorHandler = http.post('/api/agent', () => {
  return HttpResponse.json(AGENT_ERROR_RESPONSE, { status: 502 })
})

export const agentNetworkErrorHandler = http.post(
  '/api/agent',
  () => HttpResponse.error(),
)
