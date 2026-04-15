import { execSync } from 'child_process'

const exec = (command: string) => execSync(command).toString().trim()

// Git vars needed in both CI and local
process.env.GIT_BRANCH = process.env.GIT_BRANCH || exec('git rev-parse --abbrev-ref HEAD')
process.env.GIT_SHORT_SHA = process.env.GIT_SHORT_SHA || exec('git rev-parse --short=8 HEAD')

// Credentials default to empty for local read-only Broker access
if (process.env.CI !== 'true') {
  process.env.CI = 'false'
  process.env.PACT_BROKER_USERNAME = process.env.PACT_BROKER_USERNAME || ''
  process.env.PACT_BROKER_PASSWORD = process.env.PACT_BROKER_PASSWORD || ''
}
