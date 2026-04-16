import { readFileSync, existsSync } from 'node:fs'
import yaml from 'js-yaml'

import type { ValidationConfig } from './types'

export const loadConfig = (configPath: string): ValidationConfig => {
  if (!existsSync(configPath)) return {}
  return yaml.load(readFileSync(configPath, 'utf8')) as ValidationConfig
}

export const matchesGlob = (filePath: string, pattern: string): boolean => {
  if (pattern.includes('**')) {
    const prefix = pattern.split('**')[0]
    return filePath.startsWith(prefix)
  }
  return filePath === pattern
}

export const isExcluded = (filePath: string, excludes: string[]): boolean =>
  excludes.some(pattern => matchesGlob(filePath, pattern))

export const isRuleSkipped = (
  rule: string,
  filePath: string,
  skipRules: ValidationConfig['skipRules']
): boolean => {
  const skips = skipRules?.[rule]
  if (!skips) return false
  return skips.some(s => s.file === filePath)
}
