export const INTENT_MAP = {
  order: {
    response: 'I can help you track your order. What is your order number?',
    intent: 'order_tracking',
    confidence: 0.91,
  },
  help: {
    response: 'I can assist with order tracking, returns, and service status. What do you need?',
    intent: 'general_help',
    confidence: 0.85,
  },
  status: {
    response: 'All services are currently operational. Service A, B, and C are healthy.',
    intent: 'service_status',
    confidence: 0.94,
  },
} as const

export const DEFAULT_RESPONSE = {
  response: "I'm not sure I understand. Could you rephrase your question?",
  intent: 'unknown',
  confidence: 0.3,
} as const

export const AGENT_ERROR_RESPONSE = {
  error: 'Failed to reach agent service',
} as const

export const AGENT_VALIDATION_ERROR = {
  error: "Request body must include a 'message' field (string)",
} as const
