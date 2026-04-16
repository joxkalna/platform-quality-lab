export interface Container {
  name?: string
  env?: Array<{ name: string; value?: string }>
  resources?: {
    requests?: { cpu?: string; memory?: string }
    limits?: { cpu?: string; memory?: string }
  }
  readinessProbe?: { httpGet?: { path?: string } }
  livenessProbe?: { httpGet?: { path?: string } }
}

export interface K8sDocument {
  apiVersion?: string
  kind?: string
  metadata?: { name?: string }
  spec?: {
    replicas?: number
    template?: {
      spec?: {
        containers?: Container[]
      }
    }
  }
}

export interface ValidationConfig {
  excludeFiles?: string[]
  skipRules?: Record<string, Array<{ file: string; reason: string }>>
}

export interface Violation {
  file: string
  resource: string
  container?: string
  rule: string
  message: string
}

export interface RuleInput {
  doc: K8sDocument
  filePath: string
}

export type Rule = (input: RuleInput) => Violation[]
