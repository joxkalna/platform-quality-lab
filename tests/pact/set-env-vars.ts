import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const exec = (command: string) => execSync(command).toString().trim()

// Git vars — always needed
process.env.GIT_BRANCH = process.env.GIT_BRANCH || exec('git rev-parse --abbrev-ref HEAD')
process.env.GIT_SHORT_SHA = process.env.GIT_SHORT_SHA || exec('git rev-parse --short=8 HEAD')

// Load .env for Broker credentials when running locally
// In CI, the pipeline creates .env from secrets before tests run
if (!process.env.PACT_BROKER_BASE_URL) {
  try {
    for (const line of readFileSync(resolve(__dirname, '../../.env'), 'utf-8').split('\n')) {
      const match = line.match(/^([^#=]+)=(.*)$/)
      if (match) {
        const [, key, val] = match
        process.env[key.trim()] = val.trim().replace(/^["']|["']$/g, '')
      }
    }
  } catch { /* .env not found */ }
}
