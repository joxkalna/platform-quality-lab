/**
 * Ollama LLM integration stub.
 *
 * Same pattern as production provider stubs — controls what the
 * mocked 3rd party dependency returns during Pact verification and unit tests.
 *
 * Uses global fetch mock since Service C calls Ollama via fetch().
 */

let mockResponse: object | null = null

export const stubOllamaClassify = (response: object) => {
  mockResponse = response
}

export const unstubOllama = () => {
  mockResponse = null
}

/**
 * Intercepts fetch calls to the Ollama API and returns the stubbed response.
 * Non-Ollama fetch calls pass through to the real implementation.
 */
export const createFetchInterceptor = (originalFetch: typeof fetch) => {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString()

    // Intercept Ollama /api/generate calls
    if (url.includes('/api/generate') && mockResponse) {
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Intercept Ollama /api/tags calls (readiness check)
    if (url.includes('/api/tags') && mockResponse) {
      return new Response(JSON.stringify({ models: [{ name: 'llama3.2:1b' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Pass through everything else (e.g. Pact mock server calls)
    return originalFetch(input, init)
  }
}
