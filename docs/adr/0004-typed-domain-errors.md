# 0004. Typed `DomainError` hierarchy over string codes

- **Status:** Accepted
- **Date:** 2026-04-18

## Context

Earlier in the project, application handlers signaled domain failures by
throwing plain `Error` instances with stringly-typed messages:

```ts
throw new Error('NOT_FOUND');
throw new Error('CAPACITY_EXCEEDED');
```

Server actions and route handlers then `string === 'NOT_FOUND'`-matched on
`err.message`. Several pain points emerged:

- No way to attach structured details (resource type, ids, capacity numbers)
  without parsing strings.
- Refactors silently broke callers — renaming a code didn't trigger a
  TypeScript error.
- The HTTP boundary kept growing ad-hoc `if (msg === '...') return 4XX`
  ladders in every route handler.
- Easy to mis-classify (a 409 returned as a 500 because the string didn't
  match exactly).

## Decision

Define a **typed `DomainError` hierarchy** in
[`packages/domain/src/shared/result.ts`](../../packages/domain/src/shared/result.ts):

| Class | HTTP | Use |
|---|---|---|
| `NotFoundError(resource, id?, msg?)` | 404 | Missing aggregate / row |
| `UnauthorizedError` | 401 | Caller lacks permission |
| `ValidationError` | 400 | Bad input the boundary missed |
| `ConflictError` | 409 | Duplicate state (already joined, slug taken) |
| `CapacityExceededError` | 409 | Event/team is full |
| `InvariantViolation` | 422 | Generic state-machine guard |

All domain and application code throws these. Consumers narrow with
`instanceof`. The HTTP boundary in
[`apps/web/src/lib/api-helpers.ts`](../../apps/web/src/lib/api-helpers.ts)
maps `DomainError` to status code in **one place** and returns
`{ error: code, message, details }`.

## Consequences

- ✅ Renames are caught at compile time.
- ✅ Structured `details` flow through to API consumers (e.g. attendee count
  vs capacity in a 409).
- ✅ Route handlers shrink to `try { /* call handler */ } catch { handleError(err) }`.
- ✅ Server actions narrow with `instanceof` — clear, exhaustive.
- ❌ Slightly more import noise in handlers (have to import the right
  subclass) — worth it.

## Alternatives considered

- **Result types** (`Result<T, E>`). Cleaner in pure functional code but
  fights JavaScript's stack-unwinding ergonomics, especially across the
  Next.js server-action boundary which expects thrown errors for
  `notFound()`/`redirect()` to work.
- **Discriminated union object** instead of class hierarchy. Loses
  `instanceof`, which is the point — `instanceof` works across module
  boundaries even after refactors.
