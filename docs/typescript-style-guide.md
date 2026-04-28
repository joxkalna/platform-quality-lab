
# TypeScript Style Guide

This document defines conventions and best practices for writing **consistent, maintainable, and type‑safe TypeScript code** across this project.

> **Principle:** Consistency over preference.  
> Rules should be enforced by tooling wherever possible.

---

## Requirements

- TypeScript **v5.5+**
- ESLint **v9+** with flat config (`eslint.config.ts`)
- `typescript-eslint` with **strict type-checked** configuration
- Prettier for formatting
- `eslint-plugin-security` for Node.js projects

Assumed (but not required):
- React (frontend)
- Vitest / Playwright (testing)

---

## Core Principles (TL;DR)

- Prefer **immutability** (`as const`, `Readonly`, `readonly T[]`)
- Make most properties **required**
- Eliminate optional properties using **discriminated unions**
- Avoid `any`; prefer `unknown`
- Avoid type and non‑null assertions
- Prefer **pure, stateless functions**
- Use **named exports only**
- Organise code **by feature**, not by type
- Use `using` / `await using` for resource cleanup

---

## Types

### ✅ Narrow Types

Types should **describe intent** and be as narrow as possible.

```ts
// ✅ Good
type UserRole = 'admin' | 'guest';

// ❌ Avoid
const role: string = 'admin';
````

### ✅ Type Inference (Be Explicit Only When Narrowing)

```ts
// ✅ Good
const users = new Map<string, number>();

// ❌ Avoid
const users = new Map(); // Map<any, any>
```

***

## Immutability

Immutability is the default.

```ts
// ✅ Good
const users: readonly User[] = getUsers();
return users.slice(1);

// ❌ Avoid
users.splice(1);
```

Rules:

*   Use `as const` for constants
*   Use `Readonly` / `readonly T[]`
*   Mutations are allowed **only with strong justification**

***

## Required vs Optional Properties

> **Most properties should be required.**

```ts
// ❌ Avoid
type User = {
  id?: number;
  email?: string;
};
```

### ✅ Use Discriminated Unions Instead

```ts
type AdminUser = {
  role: 'admin';
  permissions: ReadonlyArray<string>;
};

type GuestUser = {
  role: 'guest';
  temporaryToken: string;
};

type User = AdminUser | GuestUser;
```

***

## Discriminated Unions (Highly Encouraged)

Use them to:

*   Remove optional properties
*   Enable exhaustive checks
*   Improve readability and refactoring

```ts
type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'square'; size: number };

const area = (shape: Shape): number => {
  switch (shape.kind) {
    case 'circle':
      return Math.PI * shape.radius ** 2;
    case 'square':
      return shape.size ** 2;
    default:
      return assertNever(shape);
  }
};
```

***

## Constants & `satisfies`

Use `as const` with `satisfies` for type‑safe constants.

```ts
const ROLES = ['admin', 'editor', 'viewer'] as const
  satisfies readonly UserRole[];
```

Benefits:

*   Literal type narrowing
*   Compile‑time validation
*   No runtime overhead

***

## `const` Type Parameters

Use `const` generic parameters to infer literal types without requiring `as const` at the call site (TS 5.0+).

```ts
// ✅ Caller gets literal types automatically
const createRoute = <const T extends readonly string[]>(paths: T) => paths;
const routes = createRoute(['users', 'posts']); // readonly ['users', 'posts']

// ❌ Without const — caller must remember `as const`
const createRoute = <T extends readonly string[]>(paths: T) => paths;
const routes = createRoute(['users', 'posts'] as const);
```

***

## Explicit Resource Management (`using`)

Use `using` and `await using` for deterministic cleanup (TS 5.2+). Replaces try/finally for connections, file handles, locks, and test fixtures.

```ts
// ✅ Good — cleanup is automatic and guaranteed
await using db = await connectToDatabase();
const users = await db.query('SELECT * FROM users');
// db[Symbol.asyncDispose]() called automatically at end of scope

// ❌ Avoid — manual cleanup is error-prone
const db = await connectToDatabase();
try {
  const users = await db.query('SELECT * FROM users');
} finally {
  await db.close();
}
```

Implement `Symbol.dispose` or `Symbol.asyncDispose` on resources:

```ts
class DatabaseConnection {
  async [Symbol.asyncDispose]() {
    await this.close();
  }
}
```

***

## Template Literal Types

Avoid wide string types for structured values.

```ts
type ApiRoute = 'users' | 'posts';
type ApiEndpoint = `/api/${ApiRoute}`;

const endpoint: ApiEndpoint = '/api/users';
```

Use cases:

*   API routes
*   i18n keys
*   CSS tokens
*   Database identifiers

***

## `NoInfer<T>`

Prevent unwanted type inference in generic positions (TS 5.4+).

```ts
// ✅ Good — default doesn't widen the inferred type
const createState = <T>(initial: T, fallback: NoInfer<T>) => ({ initial, fallback });
createState('hello', 42); // Error: number is not assignable to string

// ❌ Without NoInfer — fallback widens T to string | number
const createState = <T>(initial: T, fallback: T) => ({ initial, fallback });
createState('hello', 42); // No error — T is string | number
```

***

## Import Attributes

Use `with` syntax for non-JS module imports (TS 5.3+). Replaces deprecated `assert` syntax.

```ts
import config from './config.json' with { type: 'json' };
```

***

## `any` vs `unknown`

*   `any` is **forbidden**
*   Use `unknown` and narrow explicitly

```ts
const value: unknown = getValue();

if (typeof value === 'number') {
  process(value);
}
```

***

## Type & Non‑Null Assertions

❌ Avoid:

```ts
user as User;
user!.name;
```

✅ Acceptable only when:

*   Interacting with broken third‑party types
*   Fully documented with justification

***

## Suppressing Errors

Use `@ts-expect-error` **only** with explanation.

```ts
// @ts-expect-error: library types are incorrect (link to issue)
createUser('Gabriel');
```

Never use `@ts-ignore`.

***

## Type Definitions

*   Use **`type` aliases only**
*   Interfaces allowed **only for declaration merging**

```ts
// ✅ Preferred
type User = { id: string };

// ❌ Avoid (unless merging)
interface User { id: string }
```

***

## Functions

Functions should:

*   Have **single responsibility**
*   Be **pure** and **stateless**
*   Accept arguments and return values
*   Avoid side effects

### Single Object Parameter

```ts
// ✅ Good
parseUser({ id, role });

// ❌ Avoid
parseUser(id, role, isAdmin, isActive);
```

***

## Return Types

Rule of thumb:

*   **Explicit on boundaries**
*   **Inferred internally**

```ts
export const parseUser = (input: Input): ParsedUser => {
  ...
};
```

***

## Variables & Enums

Enums are **discouraged**.

✅ Prefer:

*   Literal unions
*   `as const` arrays / objects

```ts
const STATUSES = ['pending', 'done'] as const;
type Status = (typeof STATUSES)[number];
```

***

## Naming Conventions

### Variables

*   camelCase
*   booleans prefixed with `is`, `has`

### Constants

*   SCREAMING\_SNAKE\_CASE
*   Use `as const`

### Types

*   PascalCase

### Generics

*   Descriptive, prefixed with `T`

```ts
// ✅
<TRequest, TResponse>

// ❌
<T, K>
```

***

## Exports

✅ **Named exports only**

```ts
export const getUser = () => {};
```

Avoid default exports.

***

## Code Organisation

### Feature‑Based Structure

    ProductPage/
    ├─ api/
    ├─ components/
    ├─ hooks/
    ├─ utils/
    └─ index.tsx

Rules:

*   Collocate related code
*   Avoid “global” folders unless truly shared

***

## Imports

*   Relative imports for nearby files
*   Absolute imports for cross‑feature/shared code
*   Imports must be auto‑sorted

```ts
import { foo } from '../foo';
import { bar } from '@common/bar';
```

***

## Testing

### Principles

✅ Do:

*   Follow **AAA** (Arrange / Act / Assert)
*   Test behaviour, not implementation
*   Keep tests isolated
*   Prefer black‑box testing

❌ Don’t:

*   Test third‑party libraries
*   Over‑mock
*   Enforce 100% coverage
*   Use snapshot tests (unless justified)

### Test Naming

```ts
it('should return formatted date when input is ISO')
```

***

## Recommended `tsconfig.json`

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "noUncheckedIndexedAccess": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

Key flags:

*   `exactOptionalPropertyTypes` — distinguishes `undefined` from missing (aligns with "avoid optionals" philosophy)
*   `verbatimModuleSyntax` — replaces `isolatedModules` + `importsNotUsedAsValues`, enforces explicit `type` imports
*   `noUncheckedIndexedAccess` — array/object index access returns `T | undefined`

***

## Recommended ESLint Config

Flat config (`eslint.config.ts`) — legacy `.eslintrc` is deprecated since ESLint 9.

```ts
import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';

export default tseslint.config(
  ...tseslint.configs.strictTypeChecked,
  security.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/no-non-null-assertion': 'error',
      'import/no-default-export': 'error',
      'import/prefer-default-export': 'off',
    },
  },
);
```

***

## Security

Use `eslint-plugin-security` for Node.js projects. It catches:

*   Unsafe regex (ReDoS)
*   `eval` and dynamic code execution
*   Non-literal `require` / `fs` paths
*   Prototype pollution patterns

Aligns with the `securityConfig` in `a shared team-level ESLint config

***

## Final Notes

*   Prefer **types as contracts**
*   Prefer **compile‑time failures**
*   Prefer **readability over cleverness**
