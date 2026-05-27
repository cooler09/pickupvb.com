# 0016. Team registration mode is per-division, not per-event

- **Status:** Accepted
- **Date:** 2026-05-27
- **Supersedes:** [ADR 0008 §2 — "One team mode per event"](0008-team-registration-paradigm.md)
- **Amends:** [ADR 0012 — Registration paradigm invariants](0012-registration-paradigm-invariants.md)

## Context

ADR 0008 §2 picked one team registration mode per event as "the
simplest thing that fits 95% of tournaments." The
[registration-workflow re-audit](../audits/registration-workflow.md)
(Bundle 117, 2026-05-27) reopened that decision under finding **R3**:
the product reframing — _the event is a container; each division owns
its teams + free agents_ — implies the team registration **mode**
must travel with the division, not the event. Concrete pain:

- A single tournament cannot run AA division on rostered school teams
  while BB takes ad-hoc rec teams. The host has to pick one and split
  the bracket into two separate events, breaking the shared schedule
  and the shared bracket page.
- The deferred _division → mode → roster → pay_ wizard (ADR 0008 §6)
  is awkward because step 2 (mode) is constant across step 1 (division)
  — so the wizard has no reason to exist as a wizard.
- The `events.team_registration_mode` column was already a layer of
  indirection over what is really a division-level concern: each
  division has its own `team_composition` and `price_unit`, which are
  the things the mode actually constrains.

ADR 0008's "two aggregates" decision (§2 #2) stays intact: persistent
`Team` vs. throwaway `EventTeamRegistration` are still the right two
shapes. What moves is **which aggregate a division uses** — that
choice is now per-division, not per-event.

## Decision

### 1. `team_registration_mode` lives on `event_divisions`

`event_divisions.team_registration_mode team_registration_mode null`.
The column is nullable; `null` means "no team registration in this
division" (individual signup). Tournament divisions default to
`'ad_hoc'` at the application layer when the host doesn't pick. Open-play
events have one solo division with `null`.

`events.team_registration_mode` is **dropped** in the same migration
that adds the column. Backfill copies each division's mode from its
parent event's value before the drop. No transitional period — the
events column is gone after deploy.

### 2. Mixed-mode tournaments are explicitly supported

A tournament event may carry divisions with `ad_hoc`, `roster`, and
`null` modes side by side. The aggregate enforces the rules **per
division**, not at the event level:

| Division mode     | Required composition | Required price_unit |
| ----------------- | -------------------- | ------------------- |
| `'ad_hoc'`        | non-`solo`           | `per_team`          |
| `'roster'`        | non-`solo`           | `per_team`          |
| `null` (tourney)  | `solo`               | `per_player`        |
| `null` (openplay) | `solo`               | `per_player`        |

Event-level open-play vs. tournament still gates whether any non-`null`
mode is allowed at all — open-play events reject any division whose
mode is not `null`.

### 3. RLS gates move to the division

Two policies referenced the event-level mode and are rewritten:

- `event_team_registrations_insert` — now checks the row's `division_id`
  resolves to a division with `team_registration_mode = 'ad_hoc'`.
- `event_team_payments_insert` — now checks the team's division (via
  the `event_teams` row's `division_id`) has `team_registration_mode = 'roster'`.

### 4. UI: picker lives on the division row

The event-level `TeamRegistrationModeSelect` is removed from both the
create-event form and the edit-event form. The per-division
`DivisionsRepeater` (create) and `HostDivisionsManager` (edit) each
expose a per-row mode select. The signup-side `TournamentRegisterPanel`
resolves the mode _after_ the user picks a division.

`host-tools-section` shows the ad-hoc host management panel when _any_
division on the event is in `ad_hoc` mode; the panel itself already
groups by division.

### 5. Domain aggregate

- `Division.teamRegistrationMode: TeamRegistrationMode | null` is a
  real field on the value-shaped entity, validated in `Division.create()`.
- `VolleyballEvent.teamRegistrationMode` is **removed**. Callers that
  previously asked the event for a mode must now ask the picked
  division. Cross-cutting reads (e.g. "is _any_ division ad-hoc?") use
  `event.divisions.some((d) => d.teamRegistrationMode === 'ad_hoc')`.
- The matrix invariant (`assertRegistrationConfigValid`) iterates over
  divisions and applies the table above per row.

## Consequences

### Easier

- Mixed-mode tournaments stop being "split into two events."
- The wizard becomes coherent: pick division → mode is determined by
  the division → roster pick is mode-appropriate → pay.
- The free-agent / team panel decision is purely a function of the
  picked division — no event-level state to reconcile.

### Harder

- `VolleyballEvent.teamRegistrationMode` was a convenient
  one-liner read; callers that just want "is this a team-registration
  event at all?" now need a `some()` over divisions. Acceptable —
  there are few such callers (host-tools-section, the legacy loader
  branch). All migrated in Bundle 119.
- The boundary validator
  ([apps/web/src/lib/event-team-pricing-validation.ts](../../apps/web/src/lib/event-team-pricing-validation.ts))
  takes a per-division `teamRegistrationMode` instead of an event-level
  field. Forms that don't carry per-division mode (none today) would
  break — confirmed not the case across the codebase.
- Switching a division's mode after teams have registered remains a
  host-level footgun (carries forward from ADR 0008's "Harder" list).
  Out of scope here.

## Alternatives considered

- **Keep `events.team_registration_mode` as a transitional default for
  new divisions.** Rejected per scope decision (2026-05-27): the column
  becomes dead state the moment any division diverges from it, and
  every reader has to learn "is the event column the source of truth
  or is the division column?" — drop it cleanly in one migration.
- **Keep the event-level field and add a per-division override.**
  Worst of both worlds: hosts must understand precedence, and the
  matrix invariant doubles in complexity. Rejected.
- **Enum per division (replace `team_registration_mode` with a
  registration-shape enum that bundles mode + composition + price).**
  More surgical but requires renaming the existing `team_composition`
  and `price_unit` columns. Big-bang change for marginal clarity.
  Rejected.

## Related

- [ADR 0008 — Team registration paradigm](0008-team-registration-paradigm.md)
  (this ADR supersedes §2 only; §1, §3, §4, §5, §6 still stand).
- [ADR 0012 — Registration paradigm invariants](0012-registration-paradigm-invariants.md)
  (the matrix in §3 is amended to operate per-division).
- [ADR 0006 — Event divisions](0006-event-divisions.md).
- [ADR 0016 audit](../audits/registration-workflow.md#r3-p2--team_registration_mode-is-event-level-user-asked-for-per-division).
- Migration: [20260711000000_per_division_team_registration_mode.sql](../../supabase/migrations/20260711000000_per_division_team_registration_mode.sql).
- Domain:
  [`division.ts`](../../packages/domain/src/events/division.ts),
  [`volleyball-event.ts`](../../packages/domain/src/events/volleyball-event.ts).
- Boundary:
  [`event-team-pricing-validation.ts`](../../apps/web/src/lib/event-team-pricing-validation.ts).
