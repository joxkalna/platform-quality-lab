/**
 * Phase 4 Step 2 — OOMKill: memory limit too far from request means either
 * wasted capacity or surprise OOMKills when pods burst.
 */
import type { Rule } from '../types'
import { parseMemory } from '../parseMemory'

const MAX_RATIO = 4

export const memoryLimitRatio: Rule = ({ doc, filePath }) => {
  const name = doc.metadata?.name ?? 'unknown'
  const containers = doc.spec?.template?.spec?.containers ?? []

  return containers
    .filter(c => c.resources?.limits?.memory && c.resources?.requests?.memory)
    .map(c => {
      const limitBytes = parseMemory(c.resources!.limits!.memory!)
      const requestBytes = parseMemory(c.resources!.requests!.memory!)
      const ratio = requestBytes > 0 ? limitBytes / requestBytes : 0

      return { container: c, ratio }
    })
    .filter(({ ratio }) => ratio > MAX_RATIO)
    .map(({ container, ratio }) => ({
      file: filePath,
      resource: name,
      container: container.name ?? 'unnamed',
      rule: 'memory-limit-ratio',
      message: `memory limit/request ratio is ${ratio.toFixed(1)}x (${container.resources!.limits!.memory}/${container.resources!.requests!.memory}), must be <= ${MAX_RATIO}x`,
    }))
}
