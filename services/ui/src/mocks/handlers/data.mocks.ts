export const DATA_SUCCESS_RESPONSE = {
  source: 'service-a',
  downstream: {
    service: 'service-b',
    timestamp: 1700000000000,
    data: { version: '1.0.0' },
  },
} as const

export const DATA_ERROR_RESPONSE = {
  error: 'Failed to reach service-b',
} as const
