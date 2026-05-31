# 2026-05-30 — Bundle: positional sign-up persistence on event_divisions

Closes the P3 #9 deferred follow-up that turned out to be more than
tidying. While re-reading the audit's "no division column yet" note
I noticed the infra repo was reading `events.position_roster` — a
column that was dropped in ADR 0006 Phase 9d and never relocated.
The save path explicitly skipped writing it too. Open-play
positional sign-up has been silently broken on the write side ever
since Phase 9d landed: host form submissions accepted, never
persisted, and on reload the aggregate gets null.

This bundle restores persistence by moving the column to
`event_divisions`, matching the division-centric authority pattern
that every other primary-division mirror column followed in Phases
9a–9c.

## What shipped

**Schema (additive):**

- [`20260806000000_event_divisions_position_roster.sql`](../../supabase/migrations/20260806000000_event_divisions_position_roster.sql) —
  one nullable `position_roster jsonb` column on
  `event_divisions`. No backfill (pre-launch, no live positional
  events to recover).

**Infra round-trip restored
([`supabase-event-repository.ts`](../../packages/infrastructure/src/supabase-event-repository.ts)):**

- `position_roster` moved from `EventRow` → `DivisionRow`.
- `rowToPositionRoster(EventRow)` → `divisionRowToPositionRoster(DivisionRow | undefined)`.
- `findById` hydrates from `divisionRows[0]`.
- `getDetail` hydrates from `divisionRowsForDetail[0]`.
- `save` stamps `event.positionRoster` onto the primary division
  row inside the existing division upsert batch — no extra round
  trip.
- Stale save-comment fixed up (it claimed the column had "moved to
  division-scoped data in earlier phases"; that was aspirational,
  not actual).

**Generated types
([`database.types.ts`](../../packages/supabase/src/database.types.ts)):**

- `event_divisions` Row/Insert/Update gain `position_roster: Json | null`.

## Why "stamp on `divisions[0]`" instead of modeling on `Division`

Open-play events are single-division by invariant
([P1 #3](../audits/event-data-model.md), enforced in
`VolleyballEvent.assertRegistrationConfigValid`). The aggregate's
single `positionRoster` field maps cleanly to the one and only
division row. Tournament/league divisions leave the column null —
positional sign-up is an open-play-only concept and adding a
`positionRoster` field to `Division` would dilute that meaning
across every tournament division read path.

The aggregate-level field stays; the repo treats `position_roster`
as a persistence-side detail of "which division row holds it,"
matching how `capacity` is also resolved primary-first via
`primaryDivisionFallback`. No `Division` invariant changes.

## What's still deferred (not regressed)

The other P3 #9 leftovers are unchanged:

- `EventTeamRegistration.forfeitedAt` wiring (column exists from
  P2 #7; aggregate / repo threading waits for league host UI).
- LeagueSchedule transactional RPC + week-contiguity invariant.
- Bracket reader `source='roster'` filter loosening.
- Unused `captain_display_name` column on `event_team_entries`.
- Bridge-view callers (`event_attendees` / `event_free_agents`)
  opportunistic retargeting.

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` — all four
green. Infrastructure rebuilt (cache miss as expected); web build
cached.

## Patterns surfaced

- **"Audit said `column X moved`" deserves a grep when you encounter
  it the second time.** Phase 9d's preamble claimed `position_roster`
  moved with the rest; in fact it was the one that didn't. The
  P3 #9 minimal bundle inherited the assumption and deferred without
  checking — both the audit text and the save comment in the repo
  asserted authority lived on divisions, but no column existed
  there. Worth a tighter check next time an audit defers something
  with the rationale "X lives elsewhere already."
- **Single-aggregate field → primary-row stamp is fine when the
  invariant is real.** P1 #3 single-division for open-play means
  `divisions[0]` is unambiguous. Avoided the temptation to add a
  `Division.positionRoster` value-object field that would never be
  populated on tournament or league divisions.
