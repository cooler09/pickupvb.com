# League host-added teams + off-platform mark-paid (ADR 0033 Phase 2) (2026-06-03)

## Context

Phase 1 reframed the "walk-in" vocabulary; this bundle delivers the capability
that actually unblocks the host's stated league scenario: **a league host adds
teams that registered / paid off-platform (Venmo, check, cash) and marks them
paid**, without forcing every captain to create an account. Online
self-registration stays the alternate path.

The enabling insight (ADR 0033): the 2026-07-31 table collapse already gave us a
team-less, account-less entry shape (`event_team_entries`, `source = 'walk_in'`,
`team_id` null, freeform captain), and its `id` is the stable identity
bracket/standings reads key on. So extending host-add to leagues needed **no
`Team`-aggregate change and no new table** — only widening the gates and showing
the existing host panel for leagues.

## Decisions

- **Reuse `HostAdHocTeamsPanel` for leagues** rather than building a parallel
  league add-team UI. It already does add + mark-paid (cash/off-platform) +
  refund + remove + roster display. Leagues now render it (in the manage
  dashboard's "Run the event" group), alongside the existing `LeagueTeamsPanel`
  (forfeit/reinstate for persistent rostered teams) in "Wrap up."
- **Generalize the gate to "any team-registration division," not "league
  only."** A host-added team is allowed on ad-hoc divisions (tournaments) _or_
  roster divisions (tournaments + leagues) — `mode ∈ {ad_hoc, roster}`. Open-play
  / individual (null-mode) divisions reject. This is one coherent rule instead of
  special-casing leagues, and it incidentally lets a tournament roster division
  take host-added teams too.
- **RLS change is defense-in-depth.** The insert runs on the admin client with
  the host authorized in the application layer (`event.hostId === hostId`), so
  the new policy branch isn't load-bearing today — but it keeps the policy honest
  for the user-context flip ADR 0017 §5 anticipated, instead of the policy saying
  "walk_in only on ad_hoc" while the app inserts walk_in on roster.

## Changes

- Domain — [event-team-registration.handler.ts](../../packages/application/src/commands/event-team-registration.handler.ts):
  `RegisterWalkInTeamHandler` now accepts `Tournament | League` events and
  `ad_hoc | roster` divisions (was `Tournament + ad_hoc`). New test file
  [event-team-registration.handler.test.ts](../../packages/application/src/commands/event-team-registration.handler.test.ts)
  (league happy path, tournament ad-hoc regression, null-mode rejection,
  non-host unauthorized, missing-event not-found).
- Loader — [load-event-detail.ts](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts):
  `loadAdHocBundle` ungated for leagues + roster divisions, so host-added
  `walk_in` entries flow into `adHocHostRows`. (Public `TeamsRegisteredSection`
  is tournament-only, so nothing surfaces on the league public page unexpectedly.)
- UI — [manage-dashboard.tsx](../../apps/web/src/app/events/%5Bid%5D/manage/_components/manage-dashboard.tsx):
  `hasAdHocTeams` → `hasHostManagedTeams` (tournament _or_ league with an
  ad-hoc/roster division); panel division flag `isAdHoc` →
  [`acceptsHostTeams`](../../apps/web/src/app/events/%5Bid%5D/_components/host-ad-hoc-teams-panel.tsx).
- Migration — [20260909000000_host_added_teams_roster_rls.sql](../../supabase/migrations/20260909000000_host_added_teams_roster_rls.sql):
  adds a 4th `event_team_entries_insert` branch (host inserts `walk_in` on a
  published roster division they host). RLS-only — no schema/type change.

## Patterns observed

- **A facade-shaped reuse beats a parallel surface.** Because the host actions
  (`markWalkInPaidCash`, `hostRefund...`, `hostForceWithdraw...`) gate on
  `canManage` / aggregate state — not event type — they already worked for league
  entries; only the _create_ gate and the _loader/UI visibility_ were
  tournament-scoped. Widening two gates + one flag reused the whole existing host
  flow.

## Follow-ups / known gaps

- **Migration not applied locally** (RLS-only, no type impact, so typecheck/build
  are unaffected; CI/CD applies it on deploy). Not yet exercised against a live
  DB — the functional path uses the admin client regardless.
- **Primary-host-only.** `RegisterWalkInTeamHandler` and `MarkWalkInPaidCashHandler`
  check `event.hostId === requesterId`, so a **co-host** can open the panel
  (`canManage`) but can't add/mark — pre-existing ADR 0017 limitation, now more
  visible on club-run leagues. Worth lifting to "host or co-host."
- **Two panels per league.** Host-added teams (add/mark-paid) live in
  `HostAdHocTeamsPanel`; persistent rostered teams (forfeit/reinstate) in
  `LeagueTeamsPanel`. Fine for now (most league teams will be host-added per the
  host), but a future unify could show all teams in one roster with per-row
  actions — and would need entry-id-based forfeit (host-added teams have
  `team_id = null`, which `setLeagueTeamForfeited` doesn't handle yet).
- **No public league roster** of host-added teams yet (`TeamsRegisteredSection`
  is tournament-only). Add if leagues want a public team list.
- **Phase 3 (deferred):** captain-claim UI (ADR 0017 §7).
