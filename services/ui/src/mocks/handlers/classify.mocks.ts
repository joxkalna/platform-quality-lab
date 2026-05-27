export const CLASSIFY_SUCCESS_RESPONSE = {
  source: 'service-a',
  classification: {
    category: 'critical',
    confidence: 0.92,
    model: 'llama3.2:1b',
  },
} as const

export const CLASSIFY_SLOW_RESPONSE = {
  source: 'service-a',
  classification: {
    category: 'warning',
    confidence: 0.78,
    model: 'llama3.2:1b',
  },
} as const

export const CLASSIFY_ERROR_RESPONSE = {
  error: 'Failed to reach service-c',
} as const

export const CLASSIFY_VALIDATION_ERROR = {
  error: "Request body must include a 'text' field (string)",
} as const
