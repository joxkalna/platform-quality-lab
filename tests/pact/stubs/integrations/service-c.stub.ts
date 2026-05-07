/**
 * Service C integration stub.
 *
 * Intercepts fetch calls to Service C's /classify endpoint.
 */

let serviceCUrl: string = ''

export const stubServiceC = (url: string) => {
  serviceCUrl = url
}

export const unstubServiceC = () => {
  serviceCUrl = ''
}

export const interceptServiceC = (url: string): Response | null => {
  if (!serviceCUrl || !url.startsWith(serviceCUrl)) return null

  if (url.includes('/classify')) {
    return new Response(
      JSON.stringify({ category: 'critical', confidence: 0.95, model: 'llama3.2:1b' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }

  return new Response('Not Found', { status: 404 })
}
