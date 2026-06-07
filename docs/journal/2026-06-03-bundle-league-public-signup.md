# League public team signup — captains can register for the season (2026-06-03)

## Context

Closes follow-up #1 from
[2026-06-03-bundle-league-create-flow.md](2026-06-03-bundle-league-create-flow.md).
Once leagues became creatable in-product, the next gap surfaced
immediately: there was **no way to get a team into a league.**
[`EventSignupArea`](../../apps/web/src/app/events/[id]/_components/event-signup-area.tsx)
branched only on `open_play` / `tournament`; for `type === 'league'` it
fell through to `EventClosedState`, rendering nothing actionable. The
host-side [`LeagueTeamsPanel`](../../apps/web/src/app/events/[id]/_components/league-teams-panel.tsx)
is **forfeit/reinstate only** — it lists teams but can't add them. So a
freshly-created league had a schedule page, a manage panel, and a roster
table that were all permanently empty.

This bundle adds captain self-registration (and free-agent signup) into a
league from the public event page.

## Decisions

- **Reused the tournament roster path wholesale.** The decisive finding:
  the aggregate's `registerTeam` → `repo.save()` writes
  `event_team_entries` with `source='roster'` — the _exact_ rows the
  `/schedule` page reads via `listRegisteredTeams` and the host
  `LeagueTeamsPanel` reads via `loadLeagueTeamsByDivision`. Leagues are
  roster-only by invariant, so a league's divisions _are_ roster divisions.
  Chose to render the existing `TournamentSignupPanel` for leagues over
  building a parallel league signup component — the registration mechanics
  are identical; only the framing differs.
- **Two-line domain change, not a new command.** The only thing blocking
  reuse was a type guard: `VolleyballEvent.registerTeam` and
  `joinAsFreeAgent` threw unless `type === Tournament`. Relaxed both to
  `Tournament || League`. No new handler, port, table, or RLS — the whole
  application/infra/read-model stack was already type-agnostic (the repo
  populates `teams` / `viewerCaptainedTeams` / `freeAgents` for any type).
- **Parameterized the panel copy instead of forking it.** Added optional
  `heading` / `subheading` props to `TournamentSignupPanel` (default to the
  tournament wording) so leagues pass "League teams" / "Register your team
  for the season." Neutralized the one tournament-specific toast ("withdrawn
  from this tournament" → "from this event") so both callers read right.
- **Free agents included.** `allowFreeAgents` is meaningful for league
  divisions (the domain's open-play-only guard says so explicitly), and the
  create form already exposes the per-division checkbox — so the league
  branch wires `FreeAgentSignupPanel` exactly like tournament, gated on
  `divisions.some(d => d.allowFreeAgents)`.
- **Closed-state coherence.** A started/completed league previously offered
  "View attendees" (`#attendees`, meaningless for a team league). Added a
  league case to `EventClosedState` pointing at `/schedule` ("View
  schedule").

## Changes

- `packages/domain/src/events/volleyball-event.ts` — `registerTeam` +
  `joinAsFreeAgent` accept `League` as well as `Tournament`; JSDoc updated.
- `packages/domain/src/events/volleyball-event.test.ts` — new
  "league signup" block: `registerTeam` succeeds on a published league,
  `joinAsFreeAgent` succeeds on a free-agent-enabled league division and is
  rejected when the division opts out.
- `events/[id]/_components/event-signup-area.tsx` — new `league` branch
  (roster `TournamentSignupPanel` + `FreeAgentSignupPanel` via
  `TournamentRegisterPanel`).
- `events/[id]/_components/tournament-signup-panel.tsx` — optional
  `heading` / `subheading`; neutralized withdraw toast.
- `events/[id]/_components/event-closed-state.tsx` — league → "View
  schedule".

## Patterns observed

- **"Where do the rows land?" beats "which command?"** The reuse was only
  safe because all three surfaces (signup write, schedule read, host-panel
  read) key on the same `event_team_entries (source='roster')` shape. Tracing
  the storage shape — not the call graph — is what proved the tournament
  panel would populate the league schedule with zero new persistence.
- **A type guard is often the only thing standing between two "different"
  features.** Tournament and league team registration looked like separate
  problems; they were one method with an over-narrow `=== Tournament` check.

## Follow-ups (unchanged from the create-flow bundle)

- League discovery filter on the events directory.
- External (listing-only) leagues.
- Season → playoff bracket handoff (audit P1 #2).
- Schedule-page quality items (TZ-aware datetimes, co-host writes, realtime
  refresh) from
  [2026-05-digest.md#bundle-league-schedule-ui](2026-05-digest.md#bundle-league-schedule-ui).
  </content>
