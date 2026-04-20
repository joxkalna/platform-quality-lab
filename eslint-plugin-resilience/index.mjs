/**
 * eslint-plugin-resilience
 *
 * Custom ESLint rules enforcing resilience patterns learned from Phase 4 chaos experiments.
 * Each rule traces back to a real failure — see CHAOS.md for the full experiment log.
 *
 * Rules:
 *   resilience/fetch-requires-timeout        — fetch() must have AbortSignal.timeout()
 *   resilience/fetch-requires-error-handling  — fetch() must be in try/catch or have .catch()
 */

import fetchRequiresTimeout from "./rules/fetch-requires-timeout.mjs";
import fetchRequiresErrorHandling from "./rules/fetch-requires-error-handling.mjs";

export default {
  rules: {
    "fetch-requires-timeout": fetchRequiresTimeout,
    "fetch-requires-error-handling": fetchRequiresErrorHandling,
  },
};
