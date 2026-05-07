/**
 * Stubbed integrations for Pact provider verification.
 *
 * Each integration owns its own URL matching (intercept function).
 * This class just composes them into a single fetch interceptor.
 */

import { classifyCriticalResponse } from '../fixtures/llm-responses'
import { stubOllamaClassify, unstubOllama, createFetchInterceptor as createOllamaInterceptor } from './integrations/ollama'
import { stubServiceB, unstubServiceB, interceptServiceB } from './integrations/service-b'
import { stubServiceC, unstubServiceC, interceptServiceC } from './integrations/service-c.stub'

const originalFetch = globalThis.fetch

export class StubbedIntegrations {
  private classifyResponse: object = classifyCriticalResponse

  withClassifyResponse(response: object) {
    this.classifyResponse = response
    return this
  }

  withServiceB(url: string) {
    stubServiceB(url)
    return this
  }

  withServiceC(url: string) {
    stubServiceC(url)
    return this
  }

  start() {
    stubOllamaClassify(this.classifyResponse)
    const ollamaInterceptor = createOllamaInterceptor(originalFetch)

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input.toString()

      const stubbed = interceptServiceB(url) ?? interceptServiceC(url)
      if (stubbed) return stubbed

      return ollamaInterceptor(input, init)
    }) as typeof fetch

    return this
  }

  reset() {
    unstubOllama()
    unstubServiceB()
    unstubServiceC()
    globalThis.fetch = originalFetch
    return this
  }
}
