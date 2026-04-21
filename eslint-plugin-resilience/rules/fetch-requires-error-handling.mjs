/**
 * Rule: fetch-requires-error-handling
 *
 * Phase 4 Step 3 — Dependency failure: an unhandled fetch error crashes the
 * process instead of returning a graceful error response. The pod restarts
 * instead of degrading gracefully.
 *
 * This rule enforces that every fetch() call is wrapped in a try/catch block,
 * has a .catch() handler, or lives in a utility function that throws intentionally
 * (the caller is expected to catch).
 *
 * try { await fetch(url, opts) } catch { ... }
 * fetch(url, opts).catch(...)
 * async function classify() { const r = await fetch(...); ... throw new Error(...) }
 * await fetch(url, opts)  // bare, no error handling, no throw in function
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

        // Walk up the AST to find a try/catch or function boundary
        let current = node.parent;
        let enclosingFunction = null;
        while (current) {
          if (current.type === "TryStatement") return;
          if (
            current.type === "FunctionDeclaration" ||
            current.type === "FunctionExpression" ||
            current.type === "ArrowFunctionExpression"
          ) {
            enclosingFunction = current;
            break;
          }
          current = current.parent;
        }

        // If the enclosing function contains a throw statement, it's a utility
        // that propagates errors intentionally — the caller is expected to catch
        if (enclosingFunction && functionContainsThrow(enclosingFunction)) {
          return;
        }

        context.report({ node, messageId: "missingErrorHandling" });
      },
    };
  },
};

function isFetchCall(node) {
  return node.callee.type === "Identifier" && node.callee.name === "fetch";
}

function functionContainsThrow(funcNode) {
  const body = funcNode.body;
  if (!body) return false;

  // Walk the function body looking for throw statements
  // Stop at nested function boundaries (their throws don't count)
  return containsThrow(body, true);
}

function containsThrow(node, isRoot) {
  if (!node || typeof node !== "object") return false;

  if (node.type === "ThrowStatement") return true;

  // Don't descend into nested functions — their throws are their own
  if (
    !isRoot &&
    (node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression")
  ) {
    return false;
  }

  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const child = node[key];
    if (Array.isArray(child)) {
      if (child.some((c) => containsThrow(c, false))) return true;
    } else if (child && typeof child.type === "string") {
      if (containsThrow(child, false)) return true;
    }
  }

  return false;
}
