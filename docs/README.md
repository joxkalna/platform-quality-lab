# Documentation Index

## Testing
| Doc | What it covers |
|-----|---------------|
| [testing/strategy.md](testing/strategy.md) | Testing strategy, test layers, scaling patterns |
| [testing/chaos-log.md](testing/chaos-log.md) | Phase 4 chaos experiment log, learnings, guardrail implications |

## Pact (Contract Testing)
| Doc | What it covers |
|-----|---------------|
| [pact/00-big-picture.md](pact/00-big-picture.md) | How all Pact pieces fit together |
| [pact/01-consumer-guide.md](pact/01-consumer-guide.md) | Writing consumer pact tests |
| [pact/02-provider-verification.md](pact/02-provider-verification.md) | Provider verification patterns |
| [pact/03-provider-initialisation.md](pact/03-provider-initialisation.md) | One-time provider setup |
| [pact/04-broker-ops.md](pact/04-broker-ops.md) | Broker operations, CLI, credentials |
| [pact/05-ci-cd-patterns.md](pact/05-ci-cd-patterns.md) | CI/CD pipeline patterns |
| [pact/06-repo-separation.md](pact/06-repo-separation.md) | Monorepo vs multi-repo mapping |
| [pact/07-adoption-at-scale.md](pact/07-adoption-at-scale.md) | Large org adoption strategies |
| [pact/08-adoption-plan.md](pact/08-adoption-plan.md) | Step-by-step from zero to working Pact |
| [pact/09-coordinated-breaking-changes.md](pact/09-coordinated-breaking-changes.md) | Expand and Contract pattern |
| [pact/break-glass.md](pact/break-glass.md) | Break-glass procedure for Pact emergencies |

## Performance
| Doc | What it covers |
|-----|---------------|
| [performance/perf-min.md](performance/perf-min.md) | When performance testing is required, decision checklist |
| [performance/perf-baseline.md](performance/perf-baseline.md) | Per-endpoint thresholds, regression criteria, baseline load |
| [performance/k6-load-testing.md](performance/k6-load-testing.md) | k6 implementation plan, architecture, MR breakdown |

## CI
| Doc | What it covers |
|-----|---------------|
| [ci/ci-dependencies.md](ci/ci-dependencies.md) | CI dependency audit, image strategy |
| [ci/manifest-validation.md](ci/manifest-validation.md) | K8s policy validation rules, packaging strategy |
| [ci/code-quality-gates.md](ci/code-quality-gates.md) | Custom ESLint rules, shared coding standards path |

## Resilience
| Doc | What it covers |
|-----|---------------|
| [resilience/chaos-environments.md](resilience/chaos-environments.md) | Local → staging → production chaos mapping |
| [resilience/resilience-automation.md](resilience/resilience-automation.md) | SRE resiliency & automation walkthrough |

## Observability
| Doc | What it covers |
|-----|---------------|
| [observability/observability.md](observability/observability.md) | Observability requirements — metrics, logs, traces |

## LLMOps
| Doc | What it covers |
|-----|---------------|
| [llmops/testing-strategy.md](llmops/testing-strategy.md) | LLM evaluation, observability, quality patterns |
| [llmops/phase7-plan.md](llmops/phase7-plan.md) | Phase 7 implementation plan — golden sets, accuracy gates, consistency tests |

## Roadmap
| Doc | What it covers |
|-----|---------------|
| [roadmap/phase9-ui-frontend-quality.md](roadmap/phase9-ui-frontend-quality.md) | Phase 9 plan — React UI, Pact, Lighthouse CI, k6 browser, Playwright E2E |

## Reference
| Doc | What it covers |
|-----|---------------|
| [project-reference.md](project-reference.md) | Phases 1–5 details — Pact architecture, chaos experiments, infrastructure decisions |
| [phase6-reference.md](phase6-reference.md) | Phase 6 details — Pact exercises, k6 MRs, observability patterns |
