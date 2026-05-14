# 0001. Hexagonal architecture with CQRS-lite

- **Status:** Accepted
- **Date:** 2025-08-12

## Context

PickupVB has non-trivial domain rules (surface × format compatibility,
capacity math, visibility/RLS, status transitions) that must be enforced
identically from:

- HTML form validators in the browser
- Server-side `POST /api/events` handlers
- Background jobs (future)
- Direct Supabase mutations from admin tooling (future)

Embedding those rules in route handlers leads to drift. We also want the
domain to be testable without standing up Postgres.

## Decision

Use a **hexagonal (ports-and-adapters) architecture** with three layers:

```
@pickupvb/domain          ← aggregates, value objects, rules, ports
@pickupvb/application     ← CQRS command/query handlers
@pickupvb/infrastructure  ← adapters (e.g. SupabaseEventRepository)
apps/web                  ← Next.js: HTTP boundary + composition root
```

Dependency direction is **strictly inward** (apps/web → application →
domain ← infrastructure). The domain has no idea Supabase or Next.js exist.

We use a **CQRS-lite** split: write methods (`findById`, `save`) round-trip
through the aggregate; read methods (`search`, `getDetail`) return
denormalized read models shaped for the UI. Both sit on the same repository
port for now — no separate read store, no event sourcing.

## Consequences

- ✅ Domain rules are unit-testable in milliseconds with no DB.
- ✅ Adding a new persistence backend is mechanical (implement the port).
- ✅ Form validators and command handlers share the same `rules.ts` functions.
- ❌ More indirection for trivial CRUD. We accept the cost because most of
  our routes aren't trivial CRUD.
- 🔒 We're committed to *not* importing Next.js or Supabase from `domain`
  or `application`. CI doesn't enforce this yet — humans (and AGENTS.md) do.

## Alternatives considered

- **Plain Next.js + Supabase calls in route handlers.** Fastest to start
  with but the rule-drift problem above made this a no.
- **Full event-sourcing CQRS** with separate read/write stores. Way too much
  ceremony for a side project; revisit if/when scale demands it.
- **tRPC.** Would give us typed RPC nicely, but route handlers + Zod give
  us 90% of the benefit without an extra dep on the client.
