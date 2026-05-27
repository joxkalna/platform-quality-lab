export const CLASSIFY_PAYLOADS = {
  valid: { text: 'server is down and completely unresponsive' },
  empty: { text: '' },
  missingField: {},
  wrongType: { text: 123 },
  nullField: { text: null },
} as const

export const AGENT_PAYLOADS = {
  valid: { message: 'help me track my order' },
  empty: { message: '' },
  missingField: {},
  wrongType: { message: 42 },
} as const

export const EXPECTED_HEALTH = {
  serviceA: { status: 'ok', service: 'service-a' },
  serviceB: { status: 'ok', service: 'service-b' },
} as const

export const EXPECTED_DATA = {
  source: 'service-a',
  downstream: {
    service: 'service-b',
    data: { version: '1.0.0' },
  },
} as const
