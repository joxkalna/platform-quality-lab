/**
 * Chaos Summary Renderer
 *
 * Reads JSON reports from scripts/chaos/reports/ and outputs markdown
 * for GitHub Actions step summary. Clean table for passes, detail only for failures.
 *
 * Usage:
 *   npx tsx scripts/chaos/render-summary.ts              # preview locally
 *   npx tsx scripts/chaos/render-summary.ts >> $GITHUB_STEP_SUMMARY  # CI
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPORTS_DIR = join(__dirname, 'reports')

interface Diagnostic {
  what: string
  why: string
  where?: { file: string }
  fix?: string
}

interface Check {
  name: string
  passed: boolean
  message: string
  diagnostic?: Diagnostic
}

interface Report {
  experiment: string
  service: string
  timestamp: string
  passed: boolean
  duration_ms: number
  checks: Check[]
}

const loadReports = (): Report[] => {
  if (!existsSync(REPORTS_DIR)) return []

  return readdirSync(REPORTS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(REPORTS_DIR, f), 'utf-8')) as Report)
    .sort((a, b) => a.experiment.localeCompare(b.experiment))
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

const renderSummary = (reports: Report[]): string => {
  const passed = reports.filter(r => r.passed).length
  const failed = reports.filter(r => !r.passed).length
  const total = reports.length
  const lines: string[] = []

  // Header
  const status = failed === 0
    ? `${total} passed`
    : `${passed} passed, ${failed} failed`
  lines.push(`## Chaos Experiments — ${status}`)
  lines.push('')

  // Summary table
  lines.push('| Experiment | Service | Duration | Result |')
  lines.push('|---|---|---|---|')
  for (const r of reports) {
    const icon = r.passed ? '✅' : '❌'
    lines.push(`| ${r.experiment} | ${r.service} | ${formatDuration(r.duration_ms)} | ${icon} |`)
  }
  lines.push('')

  // Failure details
  const failures = reports.filter(r => !r.passed)
  if (failures.length > 0) {
    lines.push('---')
    lines.push('')

    for (const r of failures) {
      lines.push(`### ❌ ${r.experiment} — ${r.service}`)
      lines.push('')
      lines.push('| Check | Result |')
      lines.push('|---|---|')
      for (const c of r.checks) {
        lines.push(`| ${c.name} | ${c.passed ? '✅' : '❌'} ${c.message} |`)
      }
      lines.push('')

      const diagnostics = r.checks.filter(c => !c.passed && c.diagnostic)
      for (const c of diagnostics) {
        const d = c.diagnostic!
        lines.push(`**${c.name}:** ${d.what}`)
        lines.push(`- **Why:** ${d.why}`)
        if (d.where) lines.push(`- **Where:** \`${d.where.file}\``)
        if (d.fix) lines.push(`- **Fix:** ${d.fix}`)
        lines.push('')
      }
    }
  }

  return lines.join('\n')
}

const reports = loadReports()

if (reports.length === 0) {
  console.log('⚠️ No chaos reports found')
  process.exit(0)
}

console.log(renderSummary(reports))
