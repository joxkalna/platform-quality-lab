/**
 * Manifest Validation — Phase 5 CI Guardrail
 *
 * Parses K8s manifests in k8s/ and enforces policy rules learned from Phase 4 chaos experiments.
 * Each rule traces back to a real failure observed during chaos testing (see CHAOS.md).
 *
 * This is Layer 2 validation (policy). Layer 1 (schema) is handled by kubeconform in CI.
 *
 * Usage: npx tsx scripts/validate-manifests.ts
 */

import { readFileSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

import type { K8sDocument, Violation } from './manifest-validation/types'
import { loadConfig, isRuleSkipped } from './manifest-validation/config'
import { collectYamlFiles } from './manifest-validation/collectFiles'
import { rules } from './manifest-validation/rules/index'

const __dirname = dirname(fileURLToPath(import.meta.url))
const K8S_DIR = join(__dirname, '..', 'k8s')
const CONFIG_PATH = join(K8S_DIR, 'validation-config.yaml')

const extractDeployments = (filePath: string): Array<{ doc: K8sDocument; relPath: string }> => {
  const content = readFileSync(filePath, 'utf8')
  const docs = yaml.loadAll(content) as K8sDocument[]

  return docs
    .filter(doc => doc?.kind === 'Deployment')
    .map(doc => ({ doc, relPath: relative(K8S_DIR, filePath) }))
}

const runValidation = (): Violation[] => {
  const config = loadConfig(CONFIG_PATH)
  const excludes = config.excludeFiles ?? []
  const files = collectYamlFiles(K8S_DIR, K8S_DIR, excludes)

  if (files.length === 0) {
    console.error('No manifest files found to validate')
    process.exit(1)
  }

  console.log(`\nManifest validation: ${files.length} file(s) scanned\n`)

  return files
    .flatMap(file => extractDeployments(file))
    .flatMap(({ doc, relPath }) =>
      rules.flatMap(rule => rule({ doc, filePath: relPath }))
    )
    .filter(v => !isRuleSkipped(v.rule, v.file, config.skipRules))
}

const printReport = (violations: Violation[]): void => {
  if (violations.length === 0) {
    console.log('✅ All manifests pass policy validation\n')
    return
  }

  const byFile = Map.groupBy(violations, v => v.file)

  for (const [file, fileViolations] of byFile) {
    console.log(`❌ ${file}`)
    fileViolations.forEach(v => {
      const target = v.container ? `${v.resource}/${v.container}` : v.resource
      console.log(`   [${v.rule}] ${target}: ${v.message}`)
    })
    console.log()
  }

  console.log(
    `${violations.length} violation(s) found. Fix the manifests or add exceptions to k8s/validation-config.yaml with a documented reason.\n`
  )
}

const violations = runValidation()
printReport(violations)
process.exit(violations.length > 0 ? 1 : 0)
