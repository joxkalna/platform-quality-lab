/**
 * Phase 4 Step 3 — Dependency failure: missing probes means K8s can't detect broken pods.
 */
import type { Rule, Violation } from '../types'

export const probesExist: Rule = ({ doc, filePath }) => {
  const name = doc.metadata?.name ?? 'unknown'
  const containers = doc.spec?.template?.spec?.containers ?? []

  return containers.flatMap(container => {
    const cName = container.name ?? 'unnamed'
    const violations: Violation[] = []

    if (!container.readinessProbe) {
      violations.push({ file: filePath, resource: name, container: cName, rule: 'readiness-probe', message: 'missing readinessProbe' })
    }
    if (!container.livenessProbe) {
      violations.push({ file: filePath, resource: name, container: cName, rule: 'liveness-probe', message: 'missing livenessProbe' })
    }

    return violations
  })
}
