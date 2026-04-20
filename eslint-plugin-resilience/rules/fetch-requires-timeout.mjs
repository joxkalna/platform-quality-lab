/**
 * Rule: fetch-requires-timeout
 *
 * Phase 4 Step 3 — Dependency failure: fetch() without a timeout hangs forever
 * when the downstream service is unreachable. The catch block never fires because
 * the request never completes.
 *
 * This rule enforces that every fetch() call includes an AbortSignal.timeout()
 * in its options, either via the `signal` property or as a direct argument.
 *
 * ✅ fetch(url, { signal: AbortSignal.timeout(3000) })
 * ❌ fetch(url)
 * ❌ fetch(url, { headers: {} })
 */

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description: "Require AbortSignal.timeout on fetch() calls to prevent hanging requests",
    },
    messages: {
      missingTimeout:
        "fetch() must include a timeout via AbortSignal.timeout() in the signal option. " +
        "Without a timeout, requests hang forever when the downstream is unreachable. " +
        "See CHAOS.md Step 3 — Dependency Failure.",
    },
    schema: [],
  },

  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== "Identifier" || node.callee.name !== "fetch") return;

        const options = node.arguments[1];

        // No options object at all: fetch(url)
        if (!options) {
          context.report({ node, messageId: "missingTimeout" });
          return;
        }

        // Options is not an object literal — can't statically verify
        if (options.type !== "ObjectExpression") return;

        const signalProp = options.properties.find(
          (p) => p.type === "Property" && p.key.type === "Identifier" && p.key.name === "signal"
        );

        if (!signalProp) {
          context.report({ node, messageId: "missingTimeout" });
          return;
        }

        // Check that signal value contains AbortSignal.timeout
        const value = signalProp.value;
        if (!isAbortSignalTimeout(value)) {
          context.report({ node, messageId: "missingTimeout" });
        }
      },
    };
  },
};

function isAbortSignalTimeout(node) {
  // AbortSignal.timeout(n)
  if (
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    node.callee.object.type === "Identifier" &&
    node.callee.object.name === "AbortSignal" &&
    node.callee.property.type === "Identifier" &&
    node.callee.property.name === "timeout"
  ) {
    return true;
  }

  return false;
}
