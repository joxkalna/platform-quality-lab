/**
 * Chaos Report Schema
 *
 * Defines the JSON structure produced by chaos experiment scripts (via lib/report.sh).
 * This is the contract between chaos scripts and any consumer:
 *   - CI summary renderer (render-summary.sh)
 *   - Future: Grafana/Prometheus metrics push
 *   - Future: Datadog events API
 *   - Future: Slack/webhook notifications
 *
 * The bash report library (lib/report.sh) produces this structure.
 * This file exists for documentation and future TypeScript consumers.
 */

export interface ChaosReport {
  /** Experiment type: "pod-kill", "dependency-failure", "resource-pressure", "latency-injection" */
  experiment: string
  /** Target service: "service-a", "service-b" */
  service: string
  /** ISO 8601 UTC timestamp */
  timestamp: string
  /** Overall result — false if any check failed */
  passed: boolean
  /** Wall-clock duration of the experiment in milliseconds */
  duration_ms: number
  /** Individual checks performed during the experiment */
  checks: ChaosCheck[]
}

export interface ChaosCheck {
  /** Machine-readable check name: "service-reachable", "replicas-restored" */
  name: string
  /** Whether this check passed */
  passed: boolean
  /** Human-readable result message */
  message: string
  /** Present only on failure — points at the root cause */
  diagnostic?: ChaosDiagnostic
}

export interface ChaosDiagnostic {
  /** What went wrong */
  what: string
  /** Why it went wrong (root cause) */
  why: string
  /** Where to look — file path, K8s manifest, or config */
  where?: { file: string }
  /** How to fix it */
  fix?: string
}
