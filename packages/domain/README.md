# @pickupvb/domain

The **domain layer** for PickupVB. Pure TypeScript — no framework, no database,
no I/O. Everything an `application` handler needs to enforce business rules
lives here.

> Agents: read [AGENTS.md](../../AGENTS.md) at the repo root first.

## What lives here

```
src/
├── events/                      # Volleyball event aggregate + invariants
│   ├── volleyball-event.ts      # Aggregate root
│   ├── enums.ts                 # Surface, Format, Visibility, …
│   ├── rules.ts                 # Pure functions (e.g. isFormatAllowedForSurface)
│   ├── capacity.ts              # Value object
│   ├── location.ts              # Value object
│   ├── events.ts                # Domain events emitted by the aggregate
│   └── event-repository.ts      # Port (interface) + read-model shapes
├── teams/
├── users/
└── shared/
    ├── aggregate-root.ts        # Base class with id + domain-events buffer
    ├── brand.ts                 # `type Brand<T, B>` for type-safe ids
    └── result.ts                # DomainError hierarchy
```

## Core rules of the layer

1. **No imports from outside the domain.** No Next.js, no Supabase, no React,
   no `@pickupvb/application` or `@pickupvb/infrastructure`. The only allowed
   external dep is `@pickupvb/types` for shared DTOs.
2. **Aggregates enforce their own invariants.** State changes go through
   methods (`event.joinAsPlayer(userId)`), never through field assignment
   from the outside. Fields are `private` with `readonly` getters.
3. **Pure functions in `rules.ts`** — anything that's a yes/no question about
   domain state and doesn't need the aggregate's identity. Reusable from form
   validators, command handlers, and migrations.
4. **Errors are typed.** Throw a `DomainError` subclass — see
   [shared/result.ts](src/shared/result.ts). Never throw `Error('NOT_FOUND')`.
5. **Repository ports live with the aggregate** they read/write
   (e.g. [`events/event-repository.ts`](src/events/event-repository.ts)).
   Adapters live in `@pickupvb/infrastructure`.

## CQRS read vs. write split

The repository interface mixes **two concerns** intentionally:

| Method shape | Purpose | Returns |
|---|---|---|
| `findById(id)` / `save(agg)` | Write side — load → mutate → save the aggregate | `VolleyballEvent` |
| `search(...)` / `getDetail(...)` | Read side — denormalized for the UI | `*Summary`, `*Detail`, `*Item` |

**Don't load an aggregate just to render it.** Use a read model. Aggregates
are for state changes; read models are for queries.

## Aggregate cookbook

Adding a new state-changing operation to `VolleyballEvent`:

1. Add a method on the aggregate. Validate preconditions and throw a typed
   `DomainError` on failure. Mutate state. Push a domain event onto
   `this._domainEvents`.

   ```ts
   reschedule(newStart: Date, newEnd: Date): void {
     if (newEnd <= newStart) {
       throw new InvariantViolation('Event end must be after start.');
     }
     if (this._status === EventStatus.Cancelled) {
       throw new InvariantViolation('Cannot reschedule a cancelled event.');
     }
     this._startsAt = newStart;
     this._endsAt = newEnd;
     this.addDomainEvent(new EventRescheduled(this.id, newStart, newEnd));
   }
   ```

2. Add a unit test in `volleyball-event.test.ts` covering the happy path and
   each guard.
3. Add a command + handler in `@pickupvb/application` that calls
   `findById → method → save`.
4. Add a port method only if the operation can't be expressed as
   "load aggregate, mutate, save". Most things can.

## Adding a new aggregate

1. New folder under `src/<thing>/`.
2. Extend `AggregateRoot<TId>` from `shared/aggregate-root.ts`.
3. Brand the id: `export type FooId = Brand<string, 'FooId'>`.
4. Add a `<thing>-repository.ts` port in the same folder.
5. Re-export from `src/index.ts`.

## Testing

```bash
pnpm --filter @pickupvb/domain test
```

Tests are colocated as `*.test.ts`. They use Vitest. Domain tests should
**not** mock anything — if you find yourself wanting to mock, the dependency
probably doesn't belong in the domain layer.
