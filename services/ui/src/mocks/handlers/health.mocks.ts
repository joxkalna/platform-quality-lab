export const HEALTH_RESPONSES = {
  a: { status: 'ok', service: 'service-a' },
  b: { status: 'ok', service: 'service-b' },
  c: { status: 'ok', service: 'service-c' },
} as const

export const HEALTH_DOWN_RESPONSE = (service: 'a' | 'b' | 'c') => ({
  status: 'not ready',
  reason: `service-${service} unreachable`,
}) as const
