/**
 * Mock Ollama LLM responses.
 *
 * Fake 3rd party responses that let the service run its real logic
 * without a live dependency.
 */

export const classifyCriticalResponse = {
  response: '{"category": "critical", "confidence": "0.95"}',
  model: 'llama3.2:1b',
  created_at: '2024-01-01T00:00:00Z',
  done: true,
}

export const classifyWarningResponse = {
  response: '{"category": "warning", "confidence": "0.82"}',
  model: 'llama3.2:1b',
  created_at: '2024-01-01T00:00:00Z',
  done: true,
}

export const classifyInfoResponse = {
  response: '{"category": "info", "confidence": "0.91"}',
  model: 'llama3.2:1b',
  created_at: '2024-01-01T00:00:00Z',
  done: true,
}

export const ollamaTagsResponse = {
  models: [{ name: 'llama3.2:1b' }],
}
