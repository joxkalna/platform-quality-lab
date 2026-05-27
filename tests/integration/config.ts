const isCI = process.env.CI === 'true'

const getUrl = (envVar: string, fallback: string): string => {
  const value = process.env[envVar]
  if (isCI && !value) {
    throw new Error(`${envVar} is required in CI`)
  }
  return value || fallback
}

export const config = {
  serviceA: getUrl('SERVICE_A_URL', 'http://localhost:3000'),
  serviceB: getUrl('SERVICE_B_URL', 'http://localhost:3001'),
  serviceC: getUrl('SERVICE_C_URL', 'http://localhost:3002'),
} as const
