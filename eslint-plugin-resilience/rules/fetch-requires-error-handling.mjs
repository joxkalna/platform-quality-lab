/**
 * Rule: fetch-requires-error-handling
 *
 * Phase 4 Step 3 — Dependency failure: an unhandled fetch error crashes the
 * process instead of returning a graceful error response. The pod restarts
 * instead of degrading gracefully.
 *
 * This rule enforces that every fetch() call is wrapped in a try/catch block
 * or has a .catch() handler.
 *
 * ✅ try { await fetch(url, opts) } catch { ... }
 * ✅ fetch(url, opts).catch(...)
 * ❌ await fetch(url, opts)  // bare, no error handling
 */

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description: "Require error handling (try/catch or .catch) around fetch() calls",
    },
    messages: {
      missingErrorHandling:
        "fetch() must be wrapped in try/catch or have a .catch() handler. " +
        "Unhandled fetch errors crash the process instead of degrading gracefully. " +
        "See CHAOS.md Step 3 — Dependency Failure.",
    },
    schema: [],
  },

  create(context) {
    return {
      CallExpression(node) {
        if (!isFetchCall(node)) return;

        // Check for .catch() — fetch(...).catch(...)
        if (
          node.parent.type === "MemberExpression" &&
          node.parent.property.type === "Identifier" &&
          node.parent.property.name === "catch"
        ) {
          return;
        }

        // Walk up the AST to find a try/catch
        let current = node.parent;
        while (current) {
          if (current.type === "TryStatement") return;
          // Stop at function boundaries
          if (
            current.type === "FunctionDeclaration" ||
            current.type === "FunctionExpression" ||
            current.type === "ArrowFunctionExpression"
          ) {
            break;
          }
          current = current.parent;
        }

        context.report({ node, messageId: "missingErrorHandling" });
      },
    };
  },
};

function isFetchCall(node) {
  return node.callee.type === "Identifier" && node.callee.name === "fetch";
}
