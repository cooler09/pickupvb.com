# 2026-05-30 — Bundle: P2 #7 league rostered-team lifecycle (`forfeited_at`)

Closes the last code/schema item in the
[event-data-model audit](../audits/event-data-model.md). After this
bundle the audit backlog is effectively drained pre-launch — every
finding has either a remediation log entry, a documented no-change
decision, or a follow-up tracked in a dedicated section.

## Why this bundle

P2 #7 asked: do league rostered teams need a separate aggregate from
tournament rostered teams? They share the persistence shape
(`teams.id` + `event_team_entries.source='roster'` + an
`event_team_payments` row), so they reuse the same domain
aggregate (`EventTeamRegistration`, ratified in
[ADR 0008](../adr/0008-team-registration-paradigm.md)). The
audit recommendation was explicit: no new aggregate, no new join
table, just paper over the one lifecycle difference between the
two — a tournament team that drops out is soft-deleted the morning
of, but a league team that quits mid-season has to stay visible so
the schedule generator can skip its remaining matches and the
standings page can render "Forfeited week 5".

The fix is one nullable column.

## What shipped

**Schema (additive only):**

- New migration:
  [`20260805000000_event_team_entries_forfeited_at.sql`](../../supabase/migrations/20260805000000_event_team_entries_forfeited_at.sql)
  adds `forfeited_at timestamptz` to `event_team_entries`. No
  backfill, no index, no RLS edit, no view rebuild.
- [`packages/supabase/src/database.types.ts`](../../packages/supabase/src/database.types.ts)
  hand-patched (Docker is off locally per the recent bundles'
  convention) to surface the column on
  `event_team_entries` Row/Insert/Update.

**Docs:**

- [ADR 0008 addendum](../adr/0008-team-registration-paradigm.md#addendum-2026-05-30--league-rostered-teams) —
  explicit table of which `event_team_entries.source` values are
  valid for each event type, payments routing reaffirmed (one-shot
  Checkout, no recurring billing), forfeit-vs-soft-delete
  distinction documented. This subsumes the audit's "Document in
  ADR 0008 or new ADR 0019 that `event_team_registrations` is
  tournament-ad-hoc only" — the table referenced no longer exists
  after P2 #6.6, so the new addendum re-states the rule against
  the current shape.
- [Audit log entry](../audits/event-data-model.md) — translates
  the audit's stale `event_teams` / `event_team_registrations`
  references to the post-P2 #6.6 `event_team_entries` table and
  records the explicit deferrals.

## What's deferred (and why it's safe)

Per the audit's "Defer until a host asks for it" guidance:

- **Aggregate field.** `EventTeamRegistration.forfeitedAt` getter
  and a `forfeit(now)` mutator. Not needed until a host action
  writes the column.
- **Host action.** A "mark team forfeited" form/button on the
  league-host UI. There is no league-host UI yet.
- **Schedule-render filter.** The future league schedule view
  needs to read the column to render "Forfeited week N". The
  `LeagueSchedule` aggregate is fresh and has no generator wired
  to event-team entries yet (see
  [event-data-model.md](../audits/event-data-model.md) deferred
  follow-ups: LeagueSchedule transactional RPC + week-contiguity
  invariant).
- **Repository round-trip mapping.**
  `SupabaseEventTeamRegistrationRepository` doesn't yet write or
  read the field; it will be added with the domain field.

All four are safe to defer because the column lands as nullable
with default null — every existing read and write path continues to
work unchanged. When a league host finally needs forfeit UI, the
implementer threads the field through the aggregate and repository
in a single bundle without another migration round-trip.

## Patterns surfaced

- **Audit text drift.** P2 #7 was written when `event_teams` and
  `event_team_registrations` still existed. The remediation step
  was to translate the recommendation against the post-P2 #6.6
  shape, not to take the audit's table names verbatim. Worth
  watching for as more pre-collapse findings get drained.
- **"Schema now, code later" is a legitimate pre-launch pattern
  when the column is purely additive and forward-compatible.**
  Same shape as the P3 #11 / P3 #12 docs-only closures — record
  the decision in the right place, leave the implementation hook
  for when the consuming UI lands. Avoids over-engineering
  speculative aggregate methods that no caller exercises.

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` — all
four green. Build was mostly cached (7/8 tasks cached) since the
only code change is the generated-types hand-patch.

## Follow-ups (not part of this bundle)

Carried forward from the audit's deferred-followups list — no new
follow-ups introduced by this bundle:

- LeagueSchedule transactional RPC + strict week-contiguity
  invariant.
- Bracket reader `source='roster'` filter loosening (Step 5b.ii
  leftover).
- Unused `captain_display_name` column on `event_team_entries`.
- Bridge-view callers (`event_attendees` / `event_free_agents`)
  opportunistic retargeting.
- Positional-signup persistence for open plays (carry-over from
  P3 #9; user-tagged for the next bundle).

When a league host asks for forfeit UI: thread `forfeitedAt`
through `EventTeamRegistration` →
`SupabaseEventTeamRegistrationRepository` → a "mark forfeited"
server action → the schedule-render filter. Single bundle, no
schema change.
