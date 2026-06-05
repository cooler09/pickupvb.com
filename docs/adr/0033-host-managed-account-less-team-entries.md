# 0033. Host-managed, account-less team entries across roster/league divisions

- **Status:** Accepted
- **Date:** 2026-06-03
- **Amends:** [ADR 0017 — Walk-in registrations](0017-walk-in-registrations.md),
  [ADR 0016 — Per-division team registration mode](0016-per-division-team-registration-mode.md),
  [ADR 0012 — Registration paradigm invariants](0012-registration-paradigm-invariants.md)
- **Builds on:** the table collapse in
  [supabase/migrations/20260731000000_collapse_team_registration_tables.sql](../../supabase/migrations/20260731000000_collapse_team_registration_tables.sql)
  that unified `event_teams` + `event_team_registrations` into a single
  `event_team_entries` table.

## Context

**Product reality.** For leagues and tournaments, the _most common_ path is a
host adding teams that registered and paid **off the platform** (Venmo, check,
cash). Online self-registration + Stripe is the _desired_ path but the minority.
Forcing every captain to create an account, build a `Team`, register it, and pay
online is exactly the friction we want to remove. The host needs to add teams
manually and mark them paid, while online self-registration stays available for
the teams that want it.

**Current capability map.**

- **Ad-hoc tournament divisions already support this.** A host can add a team
  with just a name + freeform captain name/phone (no account), mark it paid
  off-platform, and refund / remove it — via the `walk_in` source
  ([walk-in-team-actions.ts](../../apps/web/src/app/events/%5Bid%5D/walk-in-team-actions.ts),
  [host-team-registration-actions.ts](../../apps/web/src/app/events/%5Bid%5D/host-team-registration-actions.ts)).
- **Leagues are forced to `roster` mode**
  ([new/actions.ts](../../apps/web/src/app/events/new/actions.ts) —
  `if (isLeague) teamRegistrationMode = 'roster'`). Roster mode requires a
  persistent `Team` with a **real-user captain** (`Team.create` makes the
  captain the sole active member — [team.ts](../../packages/domain/src/teams/team.ts)),
  and the host's only league-team control is forfeit / reinstate
  ([league-teams-panel.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/league-teams-panel.tsx)).
  So the manual host-add + mark-paid path is unavailable exactly where it's most
  needed.

**Key enabler.** The 2026-07-31 collapse unified every "team participating in a
division" row into `event_team_entries`, discriminated by
`source in ('roster', 'ad_hoc', 'walk_in')`. A `walk_in` entry is _already_ a
team-less, account-less placeholder (`team_id` null, `captain_id` null, freeform
`captain_display_name` / `captain_phone`), and its stable `id` is the identity
that brackets and standings now key on (`event_divisions.winner_entry_id`,
bracket-match `entry_id`). **The placeholder we need already exists — we do not
have to relax the `Team` aggregate.**

## Decision

1. **Generalize host-managed, account-less team entries to roster (league)
   divisions**, not just ad-hoc tournament divisions. A host-added league team
   is a team-less entry (`source = 'walk_in'`, `team_id` null, `captain_id`
   null, `captain_display_name` required, `captain_phone` optional) — the same
   shape ADR 0017 introduced — whose entry `id` provides the persistent identity
   leagues need for standings and scheduling.
2. **The persistent `Team` aggregate is unchanged.** We explicitly reject making
   `teams.captain_id` nullable: it would break the "captain is always an active
   member" invariant and ripple through every `Team` reader. Self-registering
   captains still create a persistent `Team` and register it
   (`source = 'roster'`); host-added teams live entirely on the entry. The two
   coexist within one division.
3. **Placeholder captain is claimable later** (ADR 0017 §7, still deferred). The
   schema already supports flipping a team-less entry to a real captain/`Team`;
   no claim UI ships in this initiative.
4. **Off-platform payment reuses the existing path.** The host marks paid via
   `markPaidCash` / `hostMarkTeamRegistrationPaid`, which writes the
   `offline:host:<uuid>` sentinel intent into `event_team_payments` (so the
   `charge.refunded` webhook can never match). No new payment surface.
5. **Reframe the vocabulary.** "Walk-in" (day-of improvisation) misdescribes the
   common case — a host pre-loading known teams that already paid off-platform.
   User-facing copy/labels become **"Add a team" / "Added by host."** The
   internal `source` value stays `walk_in` (no enum migration).

### Modeling decision: reuse `walk_in` vs. a new `host` source

We keep `source = 'walk_in'` for host-added account-less entries on both
tournament and league divisions, reframed in the UI as "Added by host." A
distinct `host` enum value would need a schema enum + check-constraint
migration, a backfill of intent, and branching in every read site — for a
distinction (day-of vs. pre-loaded) with **no behavioral consequence** (both are
host-created, account-less, off-platform-paid). The audit-trail nuance that
justified three sources in ADR 0017 (host-proxy-for-absent-captain vs.
improvised-at-table) was already folded into `ad_hoc` / `walk_in` by the
collapse; we don't reintroduce it.

## Rollout (phased)

- **Phase 1 (this bundle) — vocabulary reframe only.** User-facing "walk-in" →
  "Add a team" / "Added by host" across the host team-management panel
  ([host-ad-hoc-teams-panel.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/host-ad-hoc-teams-panel.tsx)),
  the public roster pill
  ([teams-registered-section.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/teams-registered-section.tsx)),
  and the bracket add-team triggers (`setup-view.tsx`, `no-bracket-view.tsx`,
  `walk-in-team-form.tsx`). **No schema / domain / RLS change.** Ships the
  tournament-side win immediately.
- **Phase 2 (deferred) — extend the host-add + mark-paid path to league/roster
  divisions.** Domain: relax `RegisterWalkInTeamHandler`'s `tournament + ad_hoc`
  gate to also accept league events on roster divisions, producing a team-less
  entry. RLS: widen the `event_team_entries` insert host branch to cover
  roster/league divisions. UI: `LeagueTeamsPanel` gains "Add a team," payment
  pills, and mark-paid / remove (today forfeit-only). Tests + journal.
- **Phase 3 (deferred) — captain-claim UI** (ADR 0017 §7).

## Consequences

**Easier.**

- Leagues and tournaments share one mental model: _the host manages teams and
  marks them paid off-platform; online self-registration is the alternate path._
- No forced account creation for teams that paid off-platform.
- Persistent identity comes free from the entry `id` — no `Team` row required.
- Minimal blast radius: no `Team`-aggregate surgery, no enum migration.

**Harder / watch.**

- A team-less entry has no `Team` page or cross-event history (acceptable — it's
  a placeholder until claimed).
- A league division mixing roster `Team` entries with host-added team-less
  entries means standings/scheduling must key on `entry_id` uniformly (already
  true post-collapse).
- The "Added by host" pill on every team could become visual noise once
  host-add is the _majority_ on a league roster — revisit pill prominence in
  Phase 2.

## Alternatives considered

- **Relax `teams.captain_id` to nullable + placeholder captain on the `Team`.**
  Rejected: breaks the central `Team` invariant, ripples through every reader,
  and the unified entry already gives us the placeholder.
- **Let league divisions use `ad_hoc` registrations for manual teams.**
  Rejected: muddies "roster = persistent teams"; the entry-level placeholder
  achieves the same without a mode change.
- **New `source = 'host'` enum value.** Rejected: schema churn for a
  non-behavioral distinction.

## Related

- [ADR 0017 — Walk-in registrations](0017-walk-in-registrations.md) (this
  generalizes §1–§6 to roster divisions; §7 claim still deferred).
- [ADR 0016 — Per-division team registration mode](0016-per-division-team-registration-mode.md),
  [ADR 0012 — Registration paradigm invariants](0012-registration-paradigm-invariants.md),
  [ADR 0007 — Team registration model](0007-team-registration-model.md).
- [docs/payments.md § Off-platform payments](../payments.md) — the off-platform
  product mode this leans on.
- Collapse migration:
  [20260731000000_collapse_team_registration_tables.sql](../../supabase/migrations/20260731000000_collapse_team_registration_tables.sql).
