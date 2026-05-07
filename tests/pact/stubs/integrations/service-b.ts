/**
 * Service B integration stub.
 *
 * Each stub owns its own matching logic and returns a response or null (pass-through).
 */

let mockInfoResponse: object | null = null
let serviceBUrl: string = ''

export const stubServiceB = (url: string, response?: object) => {
  serviceBUrl = url
  mockInfoResponse = response || {
    service: 'service-b',
    timestamp: Date.now(),
    data: { version: '1.0.0' },
  }
}

export const unstubServiceB = () => {
  mockInfoResponse = null
  serviceBUrl = ''
}

export const interceptServiceB = (url: string): Response | null => {
  if (!serviceBUrl || !url.startsWith(serviceBUrl)) return null

  if (url.includes('/info')) {
    return new Response(JSON.stringify(mockInfoResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (url.includes('/health')) {
    return new Response(JSON.stringify({ status: 'ok', service: 'service-b' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response('Not Found', { status: 404 })
}
