# 2026-05-30 — Step 8 / P3 #9 (minimal): drop primary-division mirror fields from the `VolleyballEvent` aggregate

## Why

`VolleyballEvent` was still constructed with `format`, `gender`, and
`skillLevel` as top-level fields, even though the corresponding DB
columns had already been dropped in
[`20260605000500_phase_9d_drop_legacy_events_cols.sql`](../../supabase/migrations/20260605000500_phase_9d_drop_legacy_events_cols.sql).
The repository was synthesizing them on read via
`primaryDivisionFallback(row, divisionRows)`, so the fields were
"read-only ghosts": writes went into the divisions, reads pretended
the event had its own format/gender/skill — a footgun for anyone
trying to reason about which copy is authoritative.

The audit's verbatim recommendation
([event-data-model.md § P3 #9](../audits/event-data-model.md#p3-9-volleyballevent-aggregate-still-mirrors-primary-division-fields-as-read-only-ghosts))
is to delete the mirror fields from the aggregate surface and force
callers to ask the division. This bundle ships that minimal scope.

## What shipped

- Aggregate constructor + `create()` + `fromPersistence()` no longer
  accept `format` / `gender` / `skillLevel`. The `skillLevel` getter
  is removed.
- The aggregate-level call to `assertFormatAllowedForSurface` is
  removed. The rule still fires from `Division.create` — coverage is
  preserved (verified by `rules.test.ts`).
- `CreateEventHandler` stops forwarding the three fields. The DTO
  still carries them (used by `divisionFromDto` to build the default
  division on event creation) — that's the right place for them.
- `RegisterTeamHandler` drops the redundant
  `event.format !== team.format` check. The division-level format
  check below it was already running on every code path.
- `GetEventByIdHandler` re-derives the three fields from
  `event.divisions[0]` (`skillTier → SkillLevel` via the existing
  `skillTierBand` helper), preserving the public `/api/events/[id]`
  response shape so external consumers don't break.
- `SupabaseEventRepository.findById` stops feeding the three legacy
  fields into `fromPersistence`. `primaryDivisionFallback` stays in
  place — the `getDetail` read-model path still needs it, and the
  aggregate's `capacity` fallback continues to flow through it.
- Tests: stripped 11 `VolleyballEvent.create({...})` blocks across
  `volleyball-event.test.ts` and `team.handler.test.ts`. Deleted the
  `'rejects invalid surface ↔ format combo'` test (now covered by
  `rules.test.ts` against `Division.create`). The team-handler
  Bundle-52 "format differs from event" case is subsumed by the
  surviving "format differs from division" case immediately below
  it.

## What was deliberately not changed

- **`capacity` stays on the aggregate.** It drives open-play invariant
  checks and per-team capacity enforcement — moving it would be a
  bigger surgery than this bundle. Out of scope.
- **`positionRoster` stays on the aggregate.** Positional signup for
  open plays is still aggregate-resident; there's no division column
  for it yet. Per user direction ("keep positional signup for open
  plays") this is a separate decision for a follow-up bundle.
- **`EventDetailReadModel`** (in
  [packages/domain/src/events/event-repository.ts](../../packages/domain/src/events/event-repository.ts))
  still exposes `format` / `gender` / `skillLevel`. It's a read model
  fed directly from the DB by `repo.getDetail`, not from the
  aggregate. Web pages that consume it
  (`apps/web/src/app/events/[id]/page.tsx`, `event-card.tsx`,
  `event-signup-area.tsx`, `edit/page.tsx`) are untouched. That's
  fine — the audit explicitly scoped P3 #9 to the aggregate.

## Pattern observed

The aggregate vs. read model distinction matters more than it looks.
Removing the mirror fields from the aggregate cleans up the write
surface and the in-memory invariant checks; the read model is still
free to project whatever DB shape is convenient for the page. The
two layers don't need to agree on which fields exist — they need to
agree on which one is authoritative. After this bundle, the
authoritative answer is unambiguous: ask the division.

## Follow-ups deferred

- Decide on `positionRoster` persistence (division column vs. keep on
  the aggregate vs. drop entirely). Tracked implicitly by the audit's
  P3 #9 entry — the "minimal" scope choice today leaves it for next
  bundle.
- Consider whether `EventDetailReadModel` should drop the legacy
  trio in a future cleanup once the web pages are migrated to read
  from `divisions[0]` directly. Not urgent — the read model is the
  right place for view-shape compromises.

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` — all
green. 205 domain tests, 32 application tests, 50 web tests pass.
Pre-existing scoreboard lint warnings (3, unrelated) are unchanged.
