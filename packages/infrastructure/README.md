# @pickupvb/infrastructure

The **infrastructure layer** for PickupVB. Concrete adapters that implement
the repository **ports** declared in [@pickupvb/domain](../domain/). This is
the only package outside `apps/web` that knows about Supabase tables.

> Agents: read [AGENTS.md](../../AGENTS.md) at the repo root first.

## What lives here

```
src/
├── supabase-event-repository.ts                    # EventRepository port
├── supabase-event-team-registration-repository.ts  # Team registrations
├── supabase-event-team-payment-repository.ts       # Per-team payment state
├── supabase-team-repository.ts                     # Persistent teams
├── supabase-bracket-repository.ts                  # Tournament brackets
├── supabase-community-listing-repository.ts        # /community items
├── supabase-host-stripe-account-repository.ts      # Stripe Connect accounts
├── supabase-host-subscription-repository.ts        # Pro-tier subscriptions
└── index.ts                                        # Public surface
```

## Rules of the layer

- **Implements ports, never defines them.** Every class here implements an
  interface owned by `@pickupvb/domain`. The domain stays oblivious to
  Supabase.
- **Adapts shapes at the boundary.** Snake_case Supabase rows are mapped
  into domain aggregates / value objects inside this package — the
  application layer never sees a raw DB row.
- **No business rules.** If you find yourself writing `if (event.status …)`
  here, that rule belongs in the aggregate. Adapters translate; they don't
  decide.
- **Throws typed `DomainError` subclasses** when surfacing failures the
  application layer should branch on (`NotFoundError` on a missing aggregate,
  `ConflictError` on a unique-violation race, etc.). Generic Supabase
  errors bubble up unchanged.
- **No `apps/web` imports.** This package builds standalone; it's wired
  into the web app at [apps/web/src/lib/handlers.ts](../../apps/web/src/lib/handlers.ts).

## Joins return objects, not arrays

When using `!inner` joins on single-valued FKs, the related row arrives as
a nested object (`null` if missing), not an array. Narrow with the pattern
documented in [AGENTS.md](../../AGENTS.md#supabase):

```ts
type Row = { user_id: string; role: string; profiles: { display_name: string } | null };
const typed = (rows as Row[] | null) ?? [];
```

## Testing

```bash
pnpm --filter @pickupvb/infrastructure test
```

Vitest is wired up but coverage is currently sparse; adapter tests need a
Supabase test-double strategy (open work — see the architecture audit). Until
then `--passWithNoTests` keeps CI green for adapters without tests.
