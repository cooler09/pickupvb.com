# Event-level `surface` mirror stays in sync with the primary division (2026-06-01)

## Context

A host reported an open-play event whose card/search said **Indoor** while its
only division was **Grass** (prod event `6f946808-…`, title "Grass Pickup at
Mckean Community park"). The DB showed the divergence cleanly:

| Time             | `events.surface` | `event_divisions[0].surface` |
| ---------------- | ---------------- | ---------------------------- |
| 20:29 (created)  | indoor           | indoor                       |
| 20:34 (div edit) | **indoor**       | **grass**                    |

Since ADR 0006 Phase 9d the division is the authority for surface/format/etc.,
but `events.surface` was kept as a **denormalized mirror** that event cards and
`search_events` still read. The create path stamps it from the primary division
(`topSurface = primaryDiv.surface` in
[events/new/actions.ts](../../apps/web/src/app/events/new/actions.ts)), so it's
correct at birth. Nothing kept it in sync afterwards: editing the division
surface via the host divisions manager runs `UpdateEventDivision` →
`repo.save(event)`, and `save()` writes `events.surface` from the **aggregate's
own** `event.surface` field
([supabase-event-repository.ts](../../packages/infrastructure/src/supabase-event-repository.ts))
— which was loaded as Indoor and never touched — while writing the division row
as Grass. Hence the stale mirror.

## Decisions

- **Sync the mirror in the aggregate, not the SQL adapter.** The invariant
  "`events.surface` mirrors the `sortOrder === 0` division" belongs to
  `VolleyballEvent`, so `addDivision`/`updateDivision` now call a private
  `syncSurfaceFromPrimaryDivision(division)` that re-stamps `_surface` when the
  touched division is the primary. Putting it here means **every** caller (the
  divisions manager today, any future mutation path) gets it for free, and the
  next `repo.save()` persists it through the existing line — no adapter change,
  no second write.
- **Made `surface` a private field with a getter.** It was `public readonly`;
  now `private _surface` + `get surface()`. External reads (`event.surface`) are
  unchanged; only the aggregate can move it, and only through the sync helper.
- **Chose option (1), not "stop mirroring".** The cleaner long-term fix is to
  read surface from the primary division everywhere and drop `events.surface`,
  but that touches the card/search read models and `search_events` RPC. The
  mirror-sync is the minimal, low-risk fix; the de-normalization removal is left
  as a follow-up (see below).
- **Corrected the prod row out-of-band.** PATCHed `events.surface = 'grass'` on
  the affected event so it matches its division immediately. (Direct DB write
  doesn't bust the `unstable_cache` tag, so the public card may lag until the
  next revalidate / mutation — acceptable for a one-off.)

## Tests

`packages/domain/src/events/volleyball-event.test.ts` — new describe block
"surface mirrors the primary division": `updateDivision` on the primary
re-syncs `event.surface`; `addDivision` of a `sortOrder 0` division stamps it;
editing a non-primary (`sortOrder 1`) division leaves it untouched. These fail
against the pre-fix aggregate (surface stayed at its constructor value).

## Follow-ups

- Consider removing the `events.surface` denormalization entirely and reading
  the primary division's surface in the card/search read models + `search_events`
  RPC. Until then the mirror-sync is load-bearing.
- Data-integrity sweep already run (2026-06-01): scanned all prod primary
  (`sort_order = 0`) divisions against their parent `events.surface` — after the
  one-off correction, **0 mismatches** remain (4 primary divisions total), so no
  bulk reconcile was needed. If the drift recurs before the de-normalization is
  removed, `update events e set surface = d.surface from event_divisions d where
d.event_id = e.id and d.sort_order = 0 and e.surface <> d.surface` reconciles
  it.
