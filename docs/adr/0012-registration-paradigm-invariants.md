# 0012. Registration paradigm: invariants between event type, team mode, composition, and price unit

- **Status:** Accepted (amended by [0016](0016-per-division-team-registration-mode.md): the matrix is now applied per-division, not per-event; further amended 2026-05-27 by Bundle 121: free divisions skip the price-unit constraint — see "Free-division exemption" below)
- **Date:** 2026-05-23
- **Supersedes part of:** [0007](0007-team-registration-model.md) §3 (the
  off-platform escape hatch on per-player team events is removed).
- **Amended by:** [0016](0016-per-division-team-registration-mode.md) — the
  `team_registration_mode` column moved from `events` to `event_divisions`,
  so the matrix below is enforced per division rather than per event. The
  rules themselves (which `(mode, composition, price_unit)` combinations
  are legal) are unchanged.
- **Amended by:** Bundle 121 (2026-05-27) — Rules 2 & 3's `price_unit`
  clauses are skipped when `price_cents <= 0`. Composition halves of those
  rules and Rule 4 are unchanged. See [Free-division exemption](#free-division-exemption-2026-05-27-bundle-121)
  below and [docs/journal/2026-05-27-bundle-121.md](../journal/2026-05-27-bundle-121.md).

## Context

After shipping ADR 0007 we ended up with four event-configuration knobs
that look orthogonal but are actually highly coupled:

1. `events.type` — `open_play` | `tournament`.
2. `events.team_registration_mode` — `ad_hoc` | `roster` | `null`.
3. `event_divisions.team_composition` — `solo` | `team` | `pair_draw`
   | `partners`.
4. `event_divisions.price_unit` — `per_player` | `per_team`.

The only rule enforced today (ADR 0007 §3) is that team-led tournaments
can't have per-player priced divisions unless `payments_off_platform`
is true. Everything else — composition, price-unit-vs-mode alignment,
open-play forced to individual — is undefined, so hosts can configure
combinations the app silently mis-handles:

- An open-play event with a `per_team` priced division charges every
  attendee the team price separately ([event-pricing.ts#L25](../../apps/web/src/lib/event-pricing.ts#L25)).
- A tournament with `team_registration_mode = null` accepts `per_team`
  priced divisions that no checkout path can consume.
- A `pair_draw` division with `team_registration_mode = null` is stored
  but never reachable from any signup flow.
- A `solo` division on an ad-hoc tournament makes no semantic sense (the
  captain is building a team) but is allowed.
- The off-platform escape hatch let captains register a team for a
  per-player priced division, leaving the captain unable to collect
  per-member fees through the app — money handling falls entirely on
  the host with no platform support.

The audit in [registration-workflow.md](../audits/registration-workflow.md)
flagged most of these as "stored but never enforced." We're picking the
strictest valid set so the system has one mental model instead of N.

## Decision

Adopt a single canonical valid matrix. Every other combination is
rejected at the domain invariant (`VolleyballEvent`), with the same
rule mirrored at the create/edit form boundary
([event-team-pricing-validation.ts](../../apps/web/src/lib/event-team-pricing-validation.ts))
so the host sees a useful error before save.

### Product stance

> **The captain is responsible for paying for a team.** If the event
> supports individual signups (`team_registration_mode = null`), each
> attendee pays for themself. There is no in-between — the platform
> does not split a captain's payment across teammates, and it does not
> ask individual attendees to fund a shared roster.

### The canonical matrix

| `events.type` | `team_registration_mode` | division `team_composition`        | division `price_unit` | Result                                  |
| ------------- | ------------------------ | ---------------------------------- | --------------------- | --------------------------------------- |
| `open_play`   | `null` (forced)          | `solo` (forced)                    | `per_player`          | ✅                                      |
| `tournament`  | `null`                   | `solo`                             | `per_player`          | ✅ (free-agent / individual tournament) |
| `tournament`  | `ad_hoc` or `roster`     | `team`, `pair_draw`, or `partners` | `per_team`            | ✅                                      |
| anything else | —                        | —                                  | —                     | ❌ rejected with `InvariantViolation`   |

### The four rules in plain English

1. **Open-play means individual.** `events.type = 'open_play'` ⇒
   `team_registration_mode = null` and every division has
   `team_composition = 'solo'`.
2. **Team mode requires team composition.** When
   `team_registration_mode` is `ad_hoc` or `roster`, every division must
   have `team_composition ∈ { team, pair_draw, partners }` and
   `price_unit = 'per_team'`. `solo` compositions and `per_player`
   pricing are rejected.
3. **Individual mode requires solo / per-player.** When
   `team_registration_mode = null`, every division must have
   `team_composition = 'solo'` and `price_unit = 'per_player'`.
4. **`payments_off_platform` does not relax any of the above.** The
   off-platform flag controls _whether Stripe is involved_, not _what
   shape of registration is permitted_. The previous ADR 0007 carve-out
   that allowed `(team mode + per_player + off-platform)` is removed —
   captains either pay for a team or don't form one.

### Why this shape

- Eliminates four classes of silent misconfiguration listed in the
  Context section.
- Removes the need for per-attendee or per-member checkout splitting
  that we have repeatedly declined to build.
- Keeps `team_composition` semantically meaningful: it now describes
  the captain's roster (`team` = pre-formed, `pair_draw` = drawn pairs,
  `partners` = N-slot roster the captain must fill), with
  `solo` reserved for individual signup.
- Pushes the host toward exactly one of two mental models per event:
  _"my attendees each pay"_ or _"the captain pays for the team."_

### Free-division exemption (2026-05-27, Bundle 121)

Rule 2's `price_unit = 'per_team'` clause and Rule 3's
`price_unit = 'per_player'` clause are **skipped when
`price_cents <= 0`** (free or absent price). The composition halves of
both rules and Rule 4 (off-platform doesn't relax anything) are
unchanged.

The rationale for the price-unit clauses, as written in the original
ADR, is about payment routing: "the captain pays for the team; the
platform does not split a captain's payment across teammates." That
reasoning only applies when there's money to route. With
`price_cents = 0`, Stripe is skipped entirely
([features.md#L104](../features.md#L104)) and the unit has no
observable effect — rejecting the combination forces the host to
twiddle a field that doesn't matter.

What we do instead, so the rule's original goal (coherent stored
`(price_unit, mode)` pairs) is still met:

- **Write boundary normalizes the persisted unit.** When a host
  submits a free division the server sets `price_unit = 'per_team'`
  for team-led modes and `price_unit = 'per_player'` for individual
  mode, regardless of what (if anything) the form submitted. The
  moment the host adds a price > 0, Rules 2 & 3 re-engage and the
  unit must already be coherent — it will be, because the write
  boundary kept it that way.
- **UI hides the picker on free divisions.** The "Charge" select is
  gated on `price_usd > 0` in both `DivisionsRepeater` (create form)
  and `HostDivisionsManager` (per-division edit). Hosts only see
  the unit choice when it matters.
- **Off-platform is still not a separate axis.** The exemption is
  keyed on `price_cents`, not `payments_off_platform`. A _paid_
  off-platform division still has to pick a unit that matches its
  mode; Rule 4's "off-platform isn't an escape hatch" is preserved
  for non-zero prices.

Code references:

- Domain — [`VolleyballEvent.assertRegistrationConfigValid`](../../packages/domain/src/events/volleyball-event.ts#L807-L880).
- Boundary — [`validateTeamPricing`](../../apps/web/src/lib/event-team-pricing-validation.ts).
- Write normalization —
  [`new/actions.ts`](../../apps/web/src/app/events/new/actions.ts) and
  [`division-actions.ts`](../../apps/web/src/app/events/%5Bid%5D/division-actions.ts).

## Consequences

### Breaking changes

- Configurations that were previously accepted are now rejected:
  - Tournament + team mode + `per_player` priced division + off-platform
    (the ADR 0007 §3 carve-out).
  - Tournament + team mode + any `solo` composition division.
  - Tournament + `null` mode + any `per_team` priced or non-`solo`
    composition division.
  - Open-play + any `team_registration_mode != null` or any
    non-`solo` composition or any `per_team` priced division.
- The app is pre-launch; there are no production rows on the invalid
  combinations. **No backfill migration is required.** Future agents
  picking this up after launch would need one.

### What changes in code

- `VolleyballEvent.assertRegistrationConfigValid` (renamed from
  `assertPaymentConfigValid`) enforces all four rules. Called from
  `create`, `addDivision`, and `updateDivision`. The off-platform early
  return is removed.
- `validateTeamPricing` in
  [event-team-pricing-validation.ts](../../apps/web/src/lib/event-team-pricing-validation.ts)
  is generalized into `validateRegistrationConfig` and mirrors the
  domain rules so the create/edit form surfaces the error before save.
- The new + edit event forms default `team_composition` and `price_unit`
  to values that satisfy the matrix for the chosen
  `team_registration_mode`, and the divisions repeater hides the
  options that would always be invalid for the current mode (UI
  follow-up — see "Open follow-ups").
- ADR 0007 §3's three-option resolution message is replaced by a
  shorter "switch division to `per_team` or disable team registration"
  — off-platform is no longer a way out.

### What does not change

- The four `team_composition` enum values stay (we may still need
  `pair_draw` and `partners` later — those signup flows remain
  out of scope but the enum is no longer dead metadata once rule 2
  enforces it).
- The Stripe routing in
  [docs/payments.md](../payments.md) — payouts still land with
  `events.host_id`, off-platform still skips Stripe entirely.
- Free-agent signup on tournaments with `team_registration_mode = null`
  (the existing "tournament + individual" path is rule-row #2 in the
  matrix above).

### Open follow-ups

- Pair-draw and partner-required signup flows (currently the values
  are accepted by the matrix but no UI distinguishes them from `team`).
- Per-division UI gating in the divisions repeater so invalid options
  are hidden, not just rejected on submit. (Tracked in the next bundle.)
- Decide whether multi-division events should allow mixing `team` and
  `solo` divisions across rows when the event itself is "tournament +
  null mode + free-agent only". The matrix above forbids it today
  (rule 3 applies per-division). Revisit if/when adult leagues ask for
  it.
