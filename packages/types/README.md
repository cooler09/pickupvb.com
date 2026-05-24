# @pickupvb/types

Shared **Zod schemas + inferred TS types** that live at the boundary between
the web app and the domain. Form payloads, query-string shapes, and the
narrow read-model types `apps/web` consumes from the application layer.

> Agents: read [AGENTS.md](../../AGENTS.md) at the repo root first.

## What lives here

```
src/
├── events.ts                # Event create/edit form schemas + DTOs
├── community-listings.ts    # Community listing form schemas + DTOs
└── index.ts
```

Schemas are built from Zod 4 and reuse the enums from
[@pickupvb/domain](../domain/) so the same `Format` / `Surface` /
`Visibility` literals validate the form, the request payload, and the
aggregate.

## Rules of the layer

- **Boundary types only.** This is for shapes that cross the
  network/form boundary. Internal domain value objects stay in
  `@pickupvb/domain`.
- **Depends on `@pickupvb/domain`** for enum literals — never the other
  way around. The domain must not import Zod.
- **No I/O, no framework.** Pure types + schemas.
- **Don't dump every DB row shape here.** DB row types come from
  `@pickupvb/supabase` (generated). This package is for app-authored
  shapes the database doesn't dictate.
