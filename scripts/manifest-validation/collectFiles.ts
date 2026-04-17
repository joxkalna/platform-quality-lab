import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

import { isExcluded } from './config'

export const collectYamlFiles = (
  dir: string,
  baseDir: string,
  excludes: string[]
): string[] => {
  const entries = readdirSync(dir, { withFileTypes: true })

  return entries.flatMap(entry => {
    const rel = relative(baseDir, join(dir, entry.name))

    if (entry.isDirectory()) {
      if (isExcluded(`${rel}/`, excludes)) return []
      return collectYamlFiles(join(dir, entry.name), baseDir, excludes)
    }

    if (!entry.name.endsWith('.yaml') && !entry.name.endsWith('.yml')) return []
    if (isExcluded(rel, excludes)) return []

    return [join(dir, entry.name)]
  })
}
