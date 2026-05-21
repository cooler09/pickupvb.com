# Registration Workflow Audit

_Last updated: 2026-05-21_

Audit of the event registration flow after divisions landed (ADR
[0006-event-divisions](../adr/0006-event-divisions.md)). Focus areas: how
divisions, teams, free agents, and pricing fit together; where the model
fights the user; and what to change to make the common adult-league and
youth/college flows feel native.

Scope is the registration surface only — schema, domain rules, and the
event-detail signup panels. Bracket/scoring, communications, and post-event
flows are out of scope.

> **Status:** Open. No remediation has shipped from this audit yet.

## TL;DR

The model and the UI grew up assuming a single event with a single price and
a single signup mode. Divisions and team-composition rules were bolted onto
the same surface without committing to one of the two team paradigms users
actually have:

1. **Ad-hoc team** (most adult tournaments): the captain assembles a roster
   for _this event_ and never again — names/emails on a napkin.
2. **Roster team** (HS, college, club): a persistent squad that registers
   for many events over a season.

Today the system only supports the **roster team** model (persistent
`teams` aggregate, captain + member rows that survive across events) and
forces every adult-league captain to create a "team" entity even when the
lineup will never recur. At the same time, division-aware pricing was added
without committing to who pays for what — checkout still reads the _first_
division's price and treats every signup as an independent attendee.

The two big simplifications this audit recommends:

- **Distinguish ad-hoc vs. roster team registration at the event level**,
  with ad-hoc as the default. Drop the persistent-team requirement for
  events that don't need it.
- **Let `price_unit` (per_player / per_team) actually drive payment.**
  `per_team` means the captain pays once at registration; `per_player`
  means each player pays individually OR the event opts into off-platform
  collection. Don't try to track who-paid-what within a roster.

## Current behavior

### Render decision tree

[apps/web/src/app/events/\[id\]/page.tsx](../../apps/web/src/app/events/%5Bid%5D/page.tsx)
picks a signup panel based on event type + flags. See the existing
[events-page-ux](events-page-ux.md) audit for the full render order. Just
the signup slot:

```
if (external)              → ExternalRegistrationCard (link out)
else if (open_play) {
  if (paid)                → PaidTicketPanel          (online + offline buttons)
  else if (positionRoster) → PositionRsvpPanel        (position picker)
  else                     → RsvpPanel                (join / leave / guest)
}
else if (tournament)       → TournamentRegistrationTabs
                               ├─ TournamentSignupPanel   (captain picks one of THEIR teams)
                               └─ FreeAgentSignupPanel    (solo signup + browse list)
```

[`DivisionsSection`](../../apps/web/src/app/events/%5Bid%5D/_components/divisions-section.tsx)
renders read-only badges above the signup slot. There is no division
**picker** anywhere in the signup flow.

### Pricing pipeline

[apps/web/src/lib/event-pricing.ts](../../apps/web/src/lib/event-pricing.ts)
resolves the price by reading the **first** division row and falling back to
`events.price_cents`. Comment in the file flags this explicitly: per-division
checkout is "future scope."

`event_divisions.price_unit` (`per_player` | `per_team`) is stored but never
read by checkout — every paid attendee goes through the same Stripe session
priced from the resolved single number.

### Team registration

[`TournamentSignupPanel`](../../apps/web/src/app/events/%5Bid%5D/_components/tournament-signup-panel.tsx)
lists teams **the viewer captains** that are not yet registered for the
event. Captain picks one →
[`registerTeamFromForm`](../../apps/web/src/app/events/%5Bid%5D/team-signup-actions.ts)
→ `RegisterTeamCommand`. Validation: team exists, format matches event,
event is published. Nothing charges; nothing assigns a division.

Players on the team RSVP **individually** afterward if they want to be
counted as paid. There is no "captain pays for everyone" path.

### Free agents

[`FreeAgentSignupPanel`](../../apps/web/src/app/events/%5Bid%5D/_components/free-agent-signup-panel.tsx)
inserts an `event_free_agents` row with optional notes. No division
selection. Captains browse the list manually and add players to their
roster outside of the event surface.

### Off-platform payments

`events.payments_off_platform` (added in
[20260605000700](../../supabase/migrations/20260605000700_events_payments_off_platform.sql))
hides the Stripe path but
[`PaidTicketPanel`](../../apps/web/src/app/events/%5Bid%5D/_components/paid-ticket-panel.tsx)
still surfaces both "pay online now" and "pay in person" buttons in some
states. The flag is event-wide; it can't be set per division.

## Findings

### Model

#### P1 — `event_attendees.division_id` is nullable and never populated for multi-division events

[20260605000100_event_divisions.sql](../../supabase/migrations/20260605000100_event_divisions.sql)
adds the column on `event_attendees`, `event_teams`, and `event_free_agents`
but the trigger only backfills it when the event has exactly one division.
Anything with 2+ divisions ends up with `null`, so reports, capacity, and
per-division checkout all lose the relationship.

**Fix:** require `division_id` at the registration boundary for any event
that has ≥1 division row, and add a NOT NULL constraint guarded by a check
against the event's division count (or split into `single_division_events`
vs. `multi_division_events` semantics in the domain). Backfill existing
null rows with a migration that defaults to the first division.

#### P1 — `price_unit` is stored but never enforced

`per_team` divisions don't actually charge captains a flat fee; checkout
in [event-pricing.ts](../../apps/web/src/lib/event-pricing.ts) and
[PaidTicketPanel](../../apps/web/src/app/events/%5Bid%5D/_components/paid-ticket-panel.tsx)
reads a single number and applies it per attendee.

**Fix:** split the checkout path on `price_unit`:

- `per_team` + tournament + team registration → captain-only Stripe Checkout
  for the full team price at register-team time. Mark all roster slots
  `payment_status = 'paid_via_team'` (new enum value) so member RSVPs don't
  re-prompt.
- `per_player` → status quo (each attendee checks out individually).
- `per_player` + captain-pays-everyone → not supported; require host to set
  `payments_off_platform = true` on the event (or, future scope, per
  division). See P2 below.

#### P2 — Persistent team requirement doesn't fit adult-tournament reality

`packages/domain/src/teams/team.ts` plus the `teams` table model teams as
persistent, captained entities with stable rosters. Adult tournament
captains assemble a different lineup every weekend. Today they must either
create a throwaway "team" per event (and pollute their teams list) or
shoehorn members into a roster that never plays together again.

**Fix:** introduce an **ad-hoc team registration** path that does not
persist a `teams` row. Either:

- New `event_team_registrations` aggregate (event-scoped name + captain +
  ad-hoc member entries by name/email, with optional `user_id` linkout when
  the player has an account), OR
- Reuse the existing `teams` table but mark rows `scope = 'event'` and
  hide event-scoped teams from the user's persistent teams list.

The first is cleaner long-term; the second is cheaper to ship.

Event-level setting: `team_registration_mode = 'ad_hoc' | 'roster'`
(default `ad_hoc` for tournaments), so the captain UI knows which path to
offer. Roster mode is the right default for series / leagues / school
events where the squad is stable.

#### P2 — Free agents can't declare a division

`event_free_agents` has a nullable `division_id`. Multi-division
tournaments end up with one big free-agent pool and captains can't filter
to the division they're rostering for.

**Fix:** allow free agents to select 1+ divisions on signup; persist via
a `event_free_agent_divisions` join table. Filter the captain-facing list
by division.

#### P3 — Team `format` is locked at team creation but division `format` is not validated

[`RegisterTeamCommand`](../../packages/application/src/events/commands/register-team.ts)
checks team format against `events.format`, not the chosen division's
format. A team can register for a tournament whose first division matches
event-level format but be wrong for the actual division they want.

**Fix:** validate team format against the **selected division's** format
once division selection is wired through.

### UX

#### P1 — No division picker anywhere in the signup flow

[`DivisionsSection`](../../apps/web/src/app/events/%5Bid%5D/_components/divisions-section.tsx)
shows divisions as read-only badges. Both
[`TournamentSignupPanel`](../../apps/web/src/app/events/%5Bid%5D/_components/tournament-signup-panel.tsx)
and
[`FreeAgentSignupPanel`](../../apps/web/src/app/events/%5Bid%5D/_components/free-agent-signup-panel.tsx)
register against the event, not a division. Users can't choose where they
play.

**Fix:** when an event has ≥2 divisions, make the registration flow start
with a division card grid (label · skill · gender · format · price ·
spots-left), then route into the appropriate signup panel with the
division id bound. When an event has exactly 1 division, skip the picker
silently.

#### P1 — Pricing shown in `DivisionsSection` doesn't match what checkout charges

Divisions display per-division prices in their badges, but the Stripe
checkout always uses the first division's number. Users see "$30" on
division B but get charged whatever division A costs.

**Fix:** falls out of the per-division-checkout work above. Until that
lands, suppress per-division prices and show one event-level number, so
the UI doesn't lie.

#### P2 — `PaidTicketPanel` shows two payment buttons with no context

When `payments_off_platform` is true the host wants offline only, but the
panel still renders both "pay online" and "pay in person" CTAs. Users
don't know which is authoritative.

**Fix:** when the flag is set, render a single "Reserve spot — pay $X at
the door" button. When the flag is false and the event is paid, show only
"Pay online." Drop the dual-CTA state entirely.

#### P2 — Tournament signup is two tabs that should be one flow

`TournamentRegistrationTabs` puts "Register team" and "Free agent" on
sibling tabs. The user has to know which they are before they look. Most
users want to register; the system should ask once how they want to play
(with their team / solo) and route from there.

**Fix:** single "Register" CTA → modal / inline panel that asks:

1. Which division? (skip if only one)
2. As a team or solo?
3. If team: ad-hoc or use an existing roster? (skip if event only supports
   one mode)
4. Collect roster (ad-hoc) or pick a team (roster mode).
5. Pay (`per_team` → captain pays now; `per_player` → each player pays on
   their own RSVP).

#### P3 — Free-agent list has no division context

Even before the model is fixed, the captain-facing list could be grouped
by self-declared division text. Today notes are freeform; many free
agents say their division in the notes blob.

**Fix:** parallel to the model fix, render free-agent rows grouped by
division when divisions exist; let captains "claim" a free agent into a
specific event team registration.

### Payment policy gaps

#### P1 — "Charge per person but register by team" should be off-platform only

User raised this directly: tracking who on a team paid which fraction is
not worth building. If the host wants per-player pricing AND captain-led
team registration, the only sane path is off-platform collection (captain
collects from teammates separately, marks the team paid in full).

**Fix:** in the event-edit form, disallow the combination
`(registration = team-led) + (price_unit = per_player) + (payments_off_platform = false)`.
Force the host to choose: switch to per_team pricing, switch to
per-player checkout (each player pays their own way), or set off-platform.

Surface this as a validation message at save time, not a silent fallback.

#### P2 — No way for a captain to pay for the team _through_ the platform when pricing is per-player

Even if the team_registration model gets simplified, a common request is
"captain fronts the money, players Venmo me back." Today there's no
captain-pays-everyone Stripe path.

**Fix (future):** add an opt-in "captain pre-pay" flag on the team
registration: captain checks out for `team_size × per_player_price`,
roster slots are marked paid-via-team, captain settles up with players
off-platform. Lower priority than the model fixes above.

## Recommended sequencing

1. **Decide on the team paradigm split** (ad-hoc vs. roster) at the
   product level. Everything else depends on this choice. Default to
   ad-hoc for tournaments; keep roster for series / school events. _Write
   an ADR._
2. **Wire division selection** through signup (model + UI). Make
   `division_id` NOT NULL at the boundary. Removes the silent-null trap.
3. **Per-division checkout** following `price_unit` semantics. Block the
   misconfigured combination at event-save time.
4. **Collapse tournament tabs** into a single registration flow that
   asks division → mode → roster → pay in sequence.
5. **Free-agent division tagging** (model + UI).

Each step is independently shippable. Don't try to land them all at once.

## Out of scope

- Bracket seeding and division-aware bracket UI — separate concern.
- Communications (host broadcasts, attendee email) per division — separate
  concern.
- Post-event payouts to hosts — covered elsewhere.

## Related

- [ADR 0006 — Event divisions](../adr/0006-event-divisions.md)
- [Events page UX audit](events-page-ux.md)
- Domain types:
  [packages/domain/src/events/division.ts](../../packages/domain/src/events/division.ts),
  [volleyball-event.ts](../../packages/domain/src/events/volleyball-event.ts)
- Pricing:
  [apps/web/src/lib/event-pricing.ts](../../apps/web/src/lib/event-pricing.ts)
- Page composition:
  [apps/web/src/app/events/\[id\]/page.tsx](../../apps/web/src/app/events/%5Bid%5D/page.tsx)
