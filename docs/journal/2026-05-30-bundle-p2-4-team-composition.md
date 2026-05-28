# 2026-05-30 — Bundle: P2 #4 TeamComposition vocabulary cleanup

Closed Step 6 of the event-data-model audit
([docs/audits/event-data-model.md](../audits/event-data-model.md)): renamed
the `team_composition` enum value `partner_required` → `partners`
everywhere in one bundle. Pre-launch — no production data to backfill, no
deprecation window required.

## Why

The audit flagged `PartnerRequired` as a misleading name. "Required"
implied a hard constraint that doesn't actually exist at this layer —
whether the captain _must_ bring partners up front vs. can leave slots
open is encoded by `team_registration_mode` (`roster` vs. `ad_hoc`), not
by the composition. The name also reads awkwardly next to its peers
(`solo`, `team`, `pair_draw`). `partners` is what the host-facing UI
already labels it ("Bring partner(s)").

## What shipped

- **Migration**:
  [supabase/migrations/20260804000000_rename_partner_required_to_partners.sql](../../supabase/migrations/20260804000000_rename_partner_required_to_partners.sql)
  — single statement,
  `alter type team_composition rename value 'partner_required' to 'partners'`.
- **Domain**:
  [packages/domain/src/events/enums.ts](../../packages/domain/src/events/enums.ts)
  exports `TeamComposition.Partners = 'partners'`; JSDoc reordered for
  the new vocabulary. Invariant messages in
  [volleyball-event.ts](../../packages/domain/src/events/volleyball-event.ts)
  and the validation guard in
  [division.ts](../../packages/domain/src/events/division.ts) follow.
- **Generated DB types** patched by hand at the two enum literal spots
  in [packages/supabase/src/database.types.ts](../../packages/supabase/src/database.types.ts)
  (Docker off locally; full regen next time a migration lands).
- **Web call sites** (6 files): label map, create-event action, the
  create-event divisions repeater, the per-event host divisions
  manager, the team-pricing validator, the events filter form.
- **ADRs** refreshed:
  [0006-event-divisions.md](../adr/0006-event-divisions.md) and
  [0012-registration-paradigm-invariants.md](../adr/0012-registration-paradigm-invariants.md)
  (7 spots total).

## Rejected alternative

The audit floated also collapsing `team` and `partners` into one
composition. We didn't — even though both rely on
`team_registration_mode` for the ad-hoc-vs-roster distinction, the host
form still needs to differentiate "fixed N-slot team" from
"captain + their partner(s)" at the division level. They imply
different default team sizes and different host messaging copy.

## Intentionally left alone

- [supabase/migrations/20260605000100_event_divisions.sql](../../supabase/migrations/20260605000100_event_divisions.sql)
  — applied migrations are immutable per AGENTS.md. The new rename
  migration supersedes it at runtime; the historical text stays as
  written.
- Earlier journal entries referencing `partner_required`. Same reason —
  the journal records what happened at the time.

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` — green
(15/15 typecheck, lint 3 pre-existing warnings, 179 + 50 tests, 8/8 build).

## Follow-ups deferred

- Step 8 / P3 #9: drop the legacy primary-division mirror fields
  (`format`, `gender`, `skillLevel`, `capacity`, `positionRoster`) from
  the `VolleyballEvent` aggregate constructor.
- P3 #10 / #11 / #12: docs sweep (per-event-type matrix in
  `features.md`, ADR 0006 amendment, league-payment routing note).
