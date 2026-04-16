/**
 * Phase 4 Step 1 — Pod kill: single replica = full outage on pod death.
 */
import type { Rule } from '../types'

const MIN_REPLICAS = 2

export const replicasMinimum: Rule = ({ doc, filePath }) => {
  const replicas = doc.spec?.replicas

  if (replicas !== undefined && replicas >= MIN_REPLICAS) return []

  return [{
    file: filePath,
    resource: doc.metadata?.name ?? 'unknown',
    rule: 'replicas-minimum',
    message: `replicas is ${replicas ?? 'not set'}, must be >= ${MIN_REPLICAS}`,
  }]
}
