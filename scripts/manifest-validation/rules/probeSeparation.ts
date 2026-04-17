/**
 * Phase 4 Step 3 — Dependency failure: services with downstream dependencies need
 * separate readiness and liveness paths. Readiness should check downstream health,
 * liveness should only check if the process is alive.
 */
import type { Container, Rule } from '../types'

const hasDownstreamDependency = (containers: Container[]): boolean =>
  containers.some(c =>
    c.env?.some(e => e.name.endsWith('_URL') && e.value?.includes('http://'))
  )

export const probeSeparation: Rule = ({ doc, filePath }) => {
  const name = doc.metadata?.name ?? 'unknown'
  const containers = doc.spec?.template?.spec?.containers ?? []

  if (!hasDownstreamDependency(containers)) return []

  return containers
    .filter(c => c.readinessProbe && c.livenessProbe)
    .filter(c => {
      const readinessPath = c.readinessProbe?.httpGet?.path
      const livenessPath = c.livenessProbe?.httpGet?.path
      return readinessPath && livenessPath && readinessPath === livenessPath
    })
    .map(c => ({
      file: filePath,
      resource: name,
      container: c.name ?? 'unnamed',
      rule: 'probe-separation',
      message: `readiness and liveness both use "${c.readinessProbe?.httpGet?.path}" — services with dependencies need separate paths (readiness should check downstream health)`,
    }))
}
