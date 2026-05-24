# 0007. Team registration model: ad-hoc vs. roster, division-aware, price-unit-driven

- **Status:** Accepted
- **Date:** 2026-05-21

## Context

ADR [0006](0006-event-divisions.md) introduced divisions as the playable
bracket inside an event. The audit in
[`docs/audits/registration-workflow.md`](../audits/registration-workflow.md)
identified that the registration surface didn't catch up:

- **Teams are modeled as persistent rostered squads.** The `teams`
  aggregate is captain + members that survive across events. That fits
  HS / college / club teams (a "Phoenix 17 Gold" plays many events with
  the same lineup). It does **not** fit adult tournaments, where the
  captain assembles a different 4 or 6 every Saturday. Forcing those
  captains to create persistent "teams" pollutes their teams list and
  makes them edit roster membership every weekend.

- **Division selection is missing from signup.** `DivisionsSection`
  renders divisions as read-only badges. Team registration, individual
  RSVP, and free-agent signup all bind to the event, not a division.
  `event_attendees.division_id`, `event_teams.division_id`,
  `event_free_agents.division_id` are nullable and only auto-backfilled
  by trigger when the event has exactly one division.

- **`price_unit` is stored but not enforced.** The division has
  `price_unit ∈ { per_player, per_team }` and a `price_cents` field,
  but [`event-pricing.ts`](../../apps/web/src/lib/event-pricing.ts) reads
  only the first division's `price_cents` and treats every attendee as an
  independent payer. Per-team checkout doesn't exist; per-player +
  team-registration silently does nothing (no one is charged).

- **Off-platform vs. on-platform isn't decisive.** `payments_off_platform`
  exists at the event level, but `PaidTicketPanel` still renders both
  "pay in person" and "pay online" CTAs regardless. There's no
  validation preventing the host from configuring "register by team" +
  "per_player pricing" + "on-platform" — a combination that requires the
  app to split a captain's payment across teammates, which we have
  decided not to build.

The user-facing symptoms: tournament captains say the registration flow
feels "out of place" for adult leagues, and per-division pricing on the
event detail page advertises numbers that the checkout doesn't actually
charge.

## Decision

Three interlocking changes, sequenced so each is independently
shippable:

### 1. Two team paradigms, picked per event

Introduce an event-level field `team_registration_mode ∈ { ad_hoc, roster }`,
default `ad_hoc` for tournaments and `roster` for events that explicitly
opt in (series, school events, club leagues).

- **`ad_hoc`** — Captain registers a team _at signup time_ by giving it
  a name and listing the players (existing accounts via picker, or just
  name + email for unregistered players). The team is **event-scoped**.
  It does not appear in the captain's persistent teams list. There is no
  long-running team aggregate to maintain.

  Stored in a new `event_team_registrations` table (and matching
  `EventTeamRegistration` domain aggregate). Members are rows in
  `event_team_registration_members` carrying either a `user_id` or a
  freeform `display_name` + optional `email`.

- **`roster`** — Captain picks one of their existing persistent
  `teams`. Today's flow, unchanged. Best for stable squads.

The host picks the mode in event-edit. The signup UI shows only the
mode the host enabled. (We are not allowing both modes in the same
event in v1; that ambiguity is what the audit flagged.)

### 2. Divisions become a first-class registration target

Every registration row binds to a division. To get there:

1. Backfill `division_id` on existing `event_attendees`, `event_teams`,
   `event_free_agents` rows. Events that lack a division get a default
   division created during backfill (already true for most rows because
   of the trigger; this catches the multi-division stragglers by picking
   the first division as a fallback).
2. Make the column `NOT NULL` after backfill.
3. Add a division picker to the signup flow. When an event has exactly
   one division, the picker is skipped silently. When it has ≥ 2, the
   user picks before they can proceed.
4. Validate the chosen division's `format` against the team's format on
   roster-mode team registration, and against the event-level format on
   ad-hoc team registration (since ad-hoc teams have no persistent
   format).

### 3. `price_unit` drives the checkout path

Wire the existing `event_divisions.price_unit` enum into checkout:

- **`per_team` + team registration (ad-hoc or roster)** — The captain
  pays the full division price at register-team time via Stripe
  Checkout. The team registration row carries `payment_status` analogous
  to attendee rows; once paid, all roster slots are considered paid via
  the team. Individual member RSVPs do not re-prompt for payment.

- **`per_player` + individual RSVP / free-agent signup** — Each player
  checks out individually. This is today's behavior for open-play paid
  events, generalized to tournaments.

- **`per_player` + team registration + on-platform payments** — **Not
  supported.** Event-edit save rejects the combination with a validation
  message that asks the host to choose one of: switch the division to
  `per_team`, switch to per-player individual signup (i.e. disable
  team-led registration), or set `payments_off_platform = true` (captain
  collects from teammates outside the app, marks the team paid in full).

This is the explicit decision the user requested: we will **not** build
partial-payment tracking across a roster. If a host wants per-person
collection with team registration, they collect off-platform and we
track only the binary "team paid in full" state.

A future opt-in "captain pre-pays for the whole team and settles up
off-platform" path is possible (captain checks out `team_size ×
per_player_price`) but is **out of scope for this ADR** — call it a
follow-up if demand appears.

### Composition of the new signup flow

The two sibling tabs (`TournamentSignupPanel` and
`FreeAgentSignupPanel`) collapse into a single `RegisterPanel` with this
flow:

1. **Division** — picker (skip if 1 division).
2. **Mode** — "Register a team" or "Sign up solo / as a free agent"
   (only show team option if the event's `team_registration_mode`
   permits it; for ad-hoc events the team option is "Build a team for
   this event", for roster events it's "Use one of your teams").
3. **Roster** — for ad-hoc: name + members form; for roster: pick one of
   the captain's teams; for solo: just notes/position.
4. **Pay** — `per_team` divisions → Stripe Checkout for the team;
   `per_player` divisions → either individual checkout (open-play
   pattern) or RSVP-only when off-platform.

`DivisionsSection` stays as a read-only catalog above the panel;
clicking a division row deep-links into the picker with that division
pre-selected.

## Consequences

### Easier

- Adult tournament captains stop needing to create throwaway
  `teams` rows. The event-scoped ad-hoc team is purpose-built for their
  use case.
- Per-division pricing finally means what it says on the tin.
- The captain-pays / players-pay split is explicit and surfaced at event
  creation, so the host's collection model matches the UI from the
  start.
- Free-agent → captain matching can filter by division.
- The ban on the misconfigured combination prevents a class of support
  tickets where players think they paid and the captain thinks they
  paid and nobody actually paid.

### Harder

- Two team aggregates now exist (`Team` and `EventTeamRegistration`)
  with overlapping concepts (captain, members, format). We accept the
  duplication as a smaller cost than overloading `Team` with a
  `scope = 'event'` flag that hides rows from one list and shows them
  in another.
- Backfilling `division_id` for existing multi-division events requires
  choosing a default division per registration row. We pick "first by
  `sort_order`" and accept that hosts may need to reassign edge cases.
- `team_registration_mode` adds a host-facing toggle that needs
  documentation and sensible defaults. Default is `ad_hoc` for
  tournaments to avoid surprising the common case.
- Two checkout paths (per-team session vs. per-player session) means
  two webhook update paths and two refund stories. Pricing helpers
  centralize what they can; the rest is keyed off the new
  `event_team_registrations.payment_status` column.

### Migration order

The audit's recommended sequencing is binding:

1. This ADR (decision recorded).
2. Quick-win UX fixes that don't need schema:
   - `PaidTicketPanel` collapses to a single CTA based on
     `payments_off_platform`.
   - `DivisionsSection` suppresses per-division prices on multi-division
     events until per-division checkout lands.
3. Schema: `team_registration_mode` column on `events`,
   `event_team_registrations` + members table, `division_id` backfill
   and NOT NULL, free-agent division tagging join table.
4. Domain: `EventTeamRegistration` aggregate, division-aware
   registration commands, validation against the chosen division.
5. UI: division picker, collapsed `RegisterPanel`, ad-hoc captain form,
   free-agent division multi-select.
6. Checkout: split on `price_unit`; reject the invalid combination at
   event-save.

Each numbered step ships separately, type-checks, lints, and builds.
Older flows keep working until each replacement lands.

## Alternatives considered

- **Reuse `Team` with `scope = 'event'` and a hidden flag.** Cheaper to
  ship but leaks the dual model everywhere `Team` is read (player
  profiles, team listings, follow lists). Rejected: the cleanliness of
  a dedicated event-scoped aggregate is worth the upfront cost.
- **Allow both `ad_hoc` and `roster` in the same event.** Tempting
  ("use a team if you have one, otherwise build one"), but it
  reintroduces the dual-tab confusion the audit flagged. v1 is one mode
  per event; we can revisit if demand appears.
- **Track per-player payment within a team.** What the audit calls out
  as "not worth building". Rejected explicitly.
- **Make per-division checkout work with the existing schema.**
  Possible (compute price at session-create time from the chosen
  division), but doesn't address the team paradigm mismatch. We do this
  _and_ the team-paradigm work, sequenced as above.

## Related

- [Audit: Registration workflow](../audits/registration-workflow.md)
- [ADR 0006 — Event divisions](0006-event-divisions.md)
- [ADR 0004 — Typed domain errors](0004-typed-domain-errors.md) — the
  invalid-combination validation throws `ValidationError`.
- [ADR 0005 — Page decomposition](0005-page-decomposition.md) — the
  new `RegisterPanel` follows the same `_components/` + co-located
  action conventions.
