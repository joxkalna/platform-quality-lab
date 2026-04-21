/**
 * Stubbed integrations for Pact provider verification.
 *
 * A class that sets up and tears down mocked 3rd party dependencies
 * so the service can run its real logic without live external services.
 */

import { classifyCriticalResponse } from '../fixtures/llm-responses'
import { stubOllamaClassify, unstubOllama, createFetchInterceptor } from './integrations/ollama'

const originalFetch = globalThis.fetch

export class StubbedIntegrations {
  private classifyResponse: object = classifyCriticalResponse

  withClassifyResponse(response: object) {
    this.classifyResponse = response
    return this
  }

  start() {
    stubOllamaClassify(this.classifyResponse)
    globalThis.fetch = createFetchInterceptor(originalFetch) as typeof fetch
    return this
  }

  reset() {
    unstubOllama()
    globalThis.fetch = originalFetch
    return this
  }
}
