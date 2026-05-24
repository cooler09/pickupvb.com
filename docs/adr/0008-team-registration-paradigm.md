# 0008. Team registration paradigm: per-event single mode, ad-hoc default

- **Status:** Accepted
- **Date:** 2026-05-24

## Context

[ADR 0007](0007-team-registration-model.md) bundled three decisions
(team paradigm, division-first registration, `price_unit`-driven
checkout) under a single record. Bundles 1–5 (see the journal entries
under [docs/journal/](../journal/)) shipped the division-first and
checkout pieces; the team-paradigm decision now needs its own ADR for
three reasons:

1. The
   [registration-workflow audit](../audits/registration-workflow.md#L317-L331)
   names "decide on the team paradigm split" as binding step 1 of its
   recommended sequencing — the only doc-only blocker still open after
   Bundle 5. The remaining UX/refactor items
   (`TournamentRegistrationTabs` collapse, ad-hoc live-vs-dead audit,
   free-agent claim) all lean on this decision being explicit and
   citable.
2. What actually shipped diverged in non-trivial ways from 0007 §1.
   The roster path needed a brand-new
   `EventTeamPayment` sidecar aggregate (Bundle 4) and the side-step
   `attach*ToDivision` ports (Bundles 1 & 5) — both are now
   doctrines worth recording at the paradigm layer.
3. Two team aggregates (`Team` and `EventTeamRegistration`) now coexist
   in production code. Future contributors need a one-page answer for
   "why two aggregates, and when do I use which?" without re-reading
   five journal entries.

This ADR ratifies the paradigm decision, records the patterns that
shipped, and closes the open product-level questions so the larger
single-flow refactor can proceed without re-litigation.

## Decision

### 1. One team mode per event, picked at create/edit

`events.team_registration_mode ∈ { 'ad_hoc', 'roster', null }`.
Tournaments default to `'ad_hoc'` (aggregate-enforced); the host can
switch to `'roster'` or `null` (no team registration) via the event
editor. Open-play events stay `null` by construction.

We will **not** support both modes simultaneously on the same event.
The dual-tab confusion the audit flagged is the symptom of an
unresolved product choice; the cure is making the host decide once.

### 2. Two aggregates, no shared base

- **`Team`** (`packages/domain/src/teams/team.ts`) — persistent rostered
  squad that survives across events. The owner is a captain; members
  are users. Used by `'roster'` mode and by everything outside the
  events context (team profile pages, follow lists, search).
- **`EventTeamRegistration`** (`packages/domain/src/events/event-team-registration.ts`)
  — event-scoped throwaway team. Members are `user_id` _or_ a freeform
  `display_name` + optional `email`. Lives only for the duration of
  the event. Used by `'ad_hoc'` mode.

Sharing a base aggregate was considered and rejected (see Alternatives).
The duplication is a feature: the two have different invariants
(persistent teams enforce member uniqueness across the platform;
event-scoped teams don't), different lifecycle (persistent teams
outlive any event; event-scoped teams are deleted with the event), and
different read patterns (persistent teams appear in user profiles;
event-scoped teams appear only on the event detail page).

### 3. Payment is a sidecar, not a field on the team

Both paths route captain-pays-team checkout through a dedicated
payment aggregate, not through a column on the team record itself:

- **Roster mode** — `EventTeamPayment`
  ([packages/domain/src/events/event-team-payment.ts](../../packages/domain/src/events/event-team-payment.ts))
  is a one-row-per-team-registration sidecar mirroring the
  `EventTeamRegistration` state machine. Shipped in Bundle 4.
- **Ad-hoc mode** — payment state lives on
  `event_team_registrations.payment_status` directly because the
  aggregate is already event-scoped and disposable; there is no
  separately-owned `Team` row to keep clean.

The asymmetry is intentional: roster-mode teams must not carry
event-specific payment state (a `Team` is reused across events); ad-hoc
teams have nowhere else to put it.

### 4. Division ownership stays outside the aggregate (for now)

Both `EventTeamRegistration` and the free-agent join row carry
`division_id` as a join-table column that the aggregate does **not**
model. Persisting it goes through dedicated repository ports
(`attachTeamToDivision`, `attachFreeAgentToDivision`) that the handler
calls after the aggregate runs its invariants. See
[Bundle 1 journal](../journal/2026-05-22-bundle-1.md) and
[Bundle 5 journal](../journal/2026-05-24-bundle-5.md).

This "side-step the aggregate" pattern is the right primitive **while
divisions are read-only at registration time**. If divisions ever
become an aggregate concern (e.g. capacity per-division enforced in
domain), the port disappears and `division_id` moves into the
aggregate constructor. We are deliberately not pre-empting that.

### 5. Captain-pre-pay (`per_player` + team registration) stays deferred

0007 already declared `(team-led) + (per_player) + on-platform`
unsupported. The boundary validator
[`validateTeamPricing`](../../apps/web/src/lib/event-team-pricing-validation.ts)
enforces it at event-save. If we later want a "captain pays
`team_size × per_player_price`" opt-in, it gets its own ADR — it is
not a paradigm decision, it's a pricing feature.

### 6. Single-flow collapse is a UX refactor, not a paradigm change

The eventual collapse of `TournamentRegistrationTabs` into a single
division → mode → roster → pay wizard (audit UX P2) does **not**
require a new aggregate or new tables. It just consumes the existing
two paradigms through one panel. Treat it as a pure UX bundle when
scheduled.

## Consequences

### Easier

- New contributors have one ADR to read for "why two aggregates" — no
  archaeology across five journal entries.
- The single-flow refactor can proceed without re-litigating whether to
  merge `Team` and `EventTeamRegistration`.
- The audit's recommended sequencing step 1 is closed; remaining items
  (P2/P3) are independently shippable UX work.

### Harder

- The `Team` / `EventTeamRegistration` duplication is now durable.
  Cross-cutting features (e.g. "show all teams a player has been on")
  must join both tables.
- The side-step `attach*ToDivision` ports are a documented pattern but
  remain a small impedance: handlers must remember to call the port
  after `save()`. We accept this until divisions move into the
  aggregate.
- Switching an event's `team_registration_mode` after teams have
  registered is currently a host-level footgun (no data migration
  between aggregates). We do not commit to building a migration path
  in v1; the host UI should discourage the switch once registrations
  exist (separate follow-up, not in this ADR).

## Alternatives considered

- **Single `Team` aggregate with `scope ∈ { 'persistent', 'event' }`.**
  Rejected for the same reasons 0007 §"Alternatives" called out: the
  dual model leaks into every `Team` read path. After shipping the
  ad-hoc aggregate in production we are more confident this was the
  right call — the two aggregates' invariants have already diverged
  (member uniqueness, lifecycle, ownership).
- **Allow both modes on the same event.** Re-litigated when Bundle 4
  shipped the roster path; still rejected. The host UI exposes a
  single `<select>` for a reason.
- **Move `division_id` into the aggregate now.** Considered during
  Bundle 5 (free-agent). Rejected because divisions are still
  read-only at registration time and the aggregate has no invariant
  to enforce on them. Revisit when per-division capacity lands.
- **Make `EventTeamPayment` a method on `EventTeamRegistration`.**
  Considered in Bundle 4. Rejected because roster-mode teams reference
  a `Team` we don't own — embedding payment state in `Team` would
  pollute every persistent-team read. The sidecar keeps roster-mode
  symmetric with ad-hoc (both carry `payment_status` on the
  event-scoped record).

## Related

- [ADR 0007 — Team registration model](0007-team-registration-model.md)
  (this ADR extracts and ratifies §1; 0007 stays as the historical
  decision spanning all three bundles).
- [ADR 0006 — Event divisions](0006-event-divisions.md).
- [Audit: Registration workflow](../audits/registration-workflow.md).
- Journal entries: Bundles 1–5 under [docs/journal/](../journal/).
- Domain:
  [`event-team-registration.ts`](../../packages/domain/src/events/event-team-registration.ts),
  [`event-team-payment.ts`](../../packages/domain/src/events/event-team-payment.ts),
  [`enums.ts` (`TeamRegistrationMode`)](../../packages/domain/src/events/enums.ts).
- Boundary:
  [`event-team-pricing-validation.ts`](../../apps/web/src/lib/event-team-pricing-validation.ts).
