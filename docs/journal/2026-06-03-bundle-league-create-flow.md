# League create-event flow — wire the event type into the UI (2026-06-03)

## Context

User reported leagues weren't visible anywhere in the UI. Investigation
([event-data-model.md P1 #1](../audits/event-data-model.md)) confirmed the
whole league stack is built — domain (`EventType.League`, the
`assertRegistrationConfigValid` roster invariant), DB
(`league_schedule_matches`, `save_league_schedule` /
`record_league_match_result` RPCs), application (schedule + roster handlers),
infra (`SupabaseLeagueScheduleRepository`), and the host-facing UI
(`/events/[id]/schedule`, the `LeagueTeamsPanel` in `/manage`, live scoring) —
**except the one thing that lets a league come into existence in-product: the
create-event form never offered "League" as a type.** The
[scaffolding migration](../../supabase/migrations/20260729000100_add_league_to_event_type.sql)
and the [e2e Phase 2 journal](2026-05-30-bundle-e2e-phase2-leagues.md) both
flagged this gap explicitly ("League events can be inserted via the API but
have no first-class create flow yet"). Everything downstream is gated on
`event.type === 'league'`, so with no way to set that, none of it rendered.

This bundle wires League into `/events/new` so a host can create one and
exercise the rest of the stack.

## Decisions

- **Leagues are on-platform only this bundle.** The off-platform ("external")
  toggle is hidden when League is selected, and the create action rejects
  league + external defensively. Rationale: the league value prop (schedule,
  scoring, rosters) is entirely on-platform, and an external league would have
  **0 divisions** (the external branch never renders the divisions repeater) —
  but the create handler synthesizes a default division with
  `teamRegistrationMode = null`, which the league invariant rejects ("requires
  roster"). On-platform-only sidesteps that edge cleanly. External-league
  listings are a deferred follow-up.
- **Roster mode is locked in the divisions UI, and re-forced server-side.**
  Chose a read-only note + hidden input (`requireRoster` prop on
  `DivisionsRepeater`) over leaving the team-registration picker editable,
  because every league division _must_ be roster (the invariant has no other
  valid value). The server action also forces `teamRegistrationMode = 'roster'`
  for every league row regardless of what the form posts — the UI lock is UX,
  the server force is the trust boundary (don't trust form HTML).
- **Treated league like tournament for the division-driven paths**, via a
  single `usesDivisions = isTournament || isLeague` flag in the action
  (division-required guard, `validateTeamPricing`, primary-division fallback,
  max-division-price for Stripe gating, skipping the open-play single-division
  price update). Chose one derived flag over sprinkling `|| isLeague` at each
  site so the "division-driven" concept reads as one thing.
- **No edit-form change needed.** `EditEventForm` keys on `isOpenPlay`; any
  non-open-play type already renders the tournament-style "Payment settings"
  branch (per-division pricing managed on the event page), which is correct for
  leagues. The edit form doesn't change event type, so there's nothing to add.
- **No new test.** The actual rule (league ⇒ roster + non-solo) already has
  domain coverage in
  [volleyball-event.test.ts](../../packages/domain/src/events/volleyball-event.test.ts)
  (`makeLeagueWith`). The create server action has no existing `*.test.ts` to
  match style with, and its league branch is web glue (forces a value the
  domain already guards). Per AGENTS.md testing guidance, skipped.

## Changes

- `events/new/_components/event-type-section.tsx` — third "League" TypeCard;
  grid `sm:grid-cols-2` → `sm:grid-cols-3`; hide the off-platform toggle for
  leagues.
- `events/new/new-event-form.tsx` — `handleSetType` clears `isExternal` when
  switching into League.
- `events/new/_components/format-section.tsx` — leagues show the divisions
  repeater (roster-locked) + event-level payment settings; league-aware
  subtitle.
- `events/new/_components/divisions-repeater.tsx` — `requireRoster` prop:
  default rows to `roster`, replace the team-registration picker with a
  read-only note + hidden input.
- `events/new/actions.ts` — `isLeague` / `usesDivisions`; reject league +
  external; require ≥1 division; force roster on league rows;
  `validateTeamPricing({ type: 'league' })`; division-driven pricing /
  primary-division / price-update branches; analytics `eventType: dto.type`.
- `events/new/page.tsx` — subtitle copy mentions leagues.

## Patterns observed

- **A feature can be 90% built and 0% reachable.** Every layer of leagues
  existed and passed verify, but a single missing form option made the whole
  thing dead UI. The "is it wired to a create/entry path?" check is cheap and
  catches this class of gap that typecheck/lint/build can't.
- **`isOpenPlay` as a binary in the edit form** quietly does the right thing
  for a third type because everything non-open-play shares the
  division-priced shape. Worth remembering before adding league-specific edit
  branches — they may not be needed.

## Follow-ups

- **Public team self-registration into a league.**
  [EventSignupArea](../../apps/web/src/app/events/[id]/_components/event-signup-area.tsx)
  branches only on `open_play` / `tournament`; leagues render no signup panel.
  Hosts add rostered teams via the `/manage` `LeagueTeamsPanel`, but captains
  can't self-register. (event-data-model.md)
- **League discovery filter** — no league facet on the events directory.
- **External (listing-only) leagues** — deferred with the on-platform-only
  decision above; would need the synthesized-default-division to satisfy the
  league invariant (or skip division synthesis for external leagues).
- **League playoff bracket** — season → playoff handoff still unwired
  (audit P1 #2: playoff reuses `tournament_brackets` on the same division).
- Schedule-page quality follow-ups (TZ-aware datetimes, co-host writes,
  realtime refresh) remain open from
  [2026-05-30-bundle-league-schedule-ui.md](2026-05-30-bundle-league-schedule-ui.md).
  </content>
  </invoke>
