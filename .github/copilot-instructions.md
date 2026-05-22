# Copilot instructions

The conventions, repository shape, error model, page composition rules, and
common pitfalls for this repo live in **[AGENTS.md](../AGENTS.md)** at the
repo root. Read that first.

Related reading:

- [README.md](../README.md) — human setup docs (env vars, Supabase, Vercel).
- [packages/domain/README.md](../packages/domain/README.md) — domain layer
  rules and the aggregate cookbook.
- [docs/adr/](../docs/adr/) — why hexagonal, why Supabase Auth, why typed
  domain errors, why the page-decomposition pattern.
- [docs/audits/](../docs/audits/) — point-in-time audits with a P1/P2/P3
  remediation backlog. **Read the relevant file before doing a new audit
  and write findings into it** (don't dump audit results into chat only).

## Quick reminders (also in AGENTS.md)

- Verify after any non-trivial change: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
- Throw typed `DomainError` subclasses (`NotFoundError`, `ConflictError`,
  `CapacityExceededError`, `UnauthorizedError`, `ValidationError`,
  `InvariantViolation`) — never `throw new Error('NOT_FOUND')`.
- `exactOptionalPropertyTypes: true` — use the spread pattern
  `{...(cond ? { prop } : {})}`, not `prop={cond ? x : undefined}`.
- Co-locate route sub-components under `_components/` and server actions
  next to (not inside) the page.
- `domain` and `application` packages must stay framework-free — no Next.js,
  no Supabase imports.
