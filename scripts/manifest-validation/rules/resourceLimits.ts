/**
 * Phase 4 Step 2 — CPU throttling + OOMKill: missing limits let pods starve the node.
 */
import type { Rule, Violation } from '../types'

export const resourceLimits: Rule = ({ doc, filePath }) => {
  const name = doc.metadata?.name ?? 'unknown'
  const containers = doc.spec?.template?.spec?.containers ?? []

  return containers.flatMap(container => {
    const cName = container.name ?? 'unnamed'
    const limits = container.resources?.limits
    const requests = container.resources?.requests
    const violations: Violation[] = []

    if (!limits?.cpu) {
      violations.push({ file: filePath, resource: name, container: cName, rule: 'resource-limits-cpu', message: 'missing resources.limits.cpu' })
    }
    if (!limits?.memory) {
      violations.push({ file: filePath, resource: name, container: cName, rule: 'resource-limits-memory', message: 'missing resources.limits.memory' })
    }
    if (!requests?.cpu) {
      violations.push({ file: filePath, resource: name, container: cName, rule: 'resource-requests-cpu', message: 'missing resources.requests.cpu' })
    }
    if (!requests?.memory) {
      violations.push({ file: filePath, resource: name, container: cName, rule: 'resource-requests-memory', message: 'missing resources.requests.memory' })
    }

    return violations
  })
}
