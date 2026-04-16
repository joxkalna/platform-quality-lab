const multipliers: Record<string, number> = {
  Ki: 1024,
  Mi: 1024 * 1024,
  Gi: 1024 * 1024 * 1024,
  K: 1000,
  M: 1000000,
  G: 1000000000,
  '': 1,
}

export const parseMemory = (value: string): number => {
  const match = value.match(/^(\d+)(Mi|Gi|Ki|M|G|K)?$/)
  if (!match) return 0

  const num = parseInt(match[1])
  const unit = match[2] || ''

  return num * (multipliers[unit] ?? 1)
}
