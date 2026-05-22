# @pickupvb/application

The **application layer** for PickupVB. CQRS command and query handlers that
orchestrate the [domain](../domain/) aggregates and depend on repository
**ports** (interfaces), never on Supabase or Next.js directly.

> Agents: read [AGENTS.md](../../AGENTS.md) at the repo root first.

## What lives here

```
src/
├── commands/                            # Write-side handlers (CQRS)
│   ├── create-event.handler.ts
│   ├── join-event.handler.ts            # + .test.ts
│   ├── event-team-registration.handler.ts
│   ├── event-division.handler.ts
│   ├── bracket.handler.ts
│   ├── co-host.handler.ts
│   ├── community-listing.handler.ts
│   └── team.handler.ts
├── queries/                             # Read-side handlers (CQRS)
│   ├── event-detail.handler.ts          # /events/[id] read model
│   ├── event-queries.handler.ts
│   └── community-listing-queries.handler.ts
├── messages.ts                          # Command + query payload shapes
└── index.ts                             # Public surface
```

## Rules of the layer

- **Framework-free.** No Next.js, no Supabase, no `cookies()`. The package
  must build standalone.
- **Depends inward only.** Imports from `@pickupvb/domain` and
  `@pickupvb/types`. Never from `@pickupvb/infrastructure` or `apps/web`.
- **Repository ports, not adapters.** Handlers receive `EventRepository`
  (a domain interface) — `SupabaseEventRepository` is wired in
  [apps/web/src/lib/handlers.ts](../../apps/web/src/lib/handlers.ts) at the
  composition root.
- **Throws typed `DomainError` subclasses** (`NotFoundError`,
  `ConflictError`, `CapacityExceededError`, `UnauthorizedError`,
  `ValidationError`, `InvariantViolation`). Never `throw new Error('CODE')`.
  See the error table in [AGENTS.md](../../AGENTS.md).
- **Pure.** Handlers are deterministic given their inputs and port
  responses; side effects (DB writes, email sends) happen via injected
  ports.

## Testing

```bash
pnpm --filter @pickupvb/application test
```

Unit tests sit next to the handler they cover (e.g.
[src/commands/join-event.handler.test.ts](src/commands/join-event.handler.test.ts)).
Add a test when introducing a new invariant or branching code path.
