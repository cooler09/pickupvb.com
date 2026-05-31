# Bundle: E2E Phase 2 — league schedule + record + forfeit (C2) (2026-05-30)

Second **deep-coverage** phase of the e2e coverage audit
([docs/audits/e2e-tests.md](../audits/e2e-tests.md)). Phase 1 covered brackets;
this delivers the other P1 coverage gap — **leagues**, the newest and
least-covered feature area — with three mutating tests against a
self-provisioned league.

**Date:** 2026-05-30
**Scope:** Test-only — new `apps/web/tests/e2e/_helpers/league.ts`, new
`apps/web/tests/e2e/league.authed.spec.ts`. No app/domain/application code.

## Context

C2 (P1): leagues had **zero** coverage — not even a `test.fixme`. The
match-result write goes through the `record_league_match_result` SECURITY
INVOKER RPC gated by the `league_schedule_matches_update` RLS policy (host or
either captain), exactly the place a silent authorization regression would hide
(the same class of bug AGENTS pitfall #8 calls out for brackets).

The audit assumed the bracket phase's shape would transfer: self-provision a
league through the UI, then drive it. **It does not.** While reading the
surface I found leagues have **no UI provisioning path at all**:

- The `/events/new` event-type chooser (`event-type-section.tsx`) offers only
  **Open Play** and **Tournament**. `new/actions.ts` and the divisions repeater
  only branch on those two. There is no way to _create_ a league from the UI.
- `EventSignupArea` renders signup/registration only for `open_play` and
  `tournament`; for `type === 'league'` it renders nothing. There is no way to
  _register a team_ into a league from the UI either.

Leagues can only be brought into existence at the data layer — the
`add_league_to_event_type` migration says so outright ("League events can be
inserted via the API but have no first-class create flow yet"). So Phase 2 had
to provision its fixture through the service-role client, and the maintainer
chose that explicitly over a persistent SQL seed.

## Decisions

- **Chose an admin-client self-provisioning helper over a persistent SQL seed
  (`E2ETFR`-style).** Maintainer's call. It honors the reliability contract
  (each test owns + tears down its own fixture, no shared mutable state) and
  needs no manual "apply seed to dev" step. Cost: the helper replicates the
  row recipe in code and depends on the opt-in service-role client.
- **Reused the `cleanup.ts` admin client (`E2E_CLEANUP_SUPABASE_*`) rather than
  a second client.** It is already the sanctioned service-role surface for
  tests; the helper adds `createLeagueFixture` / `deleteLeagueFixture` next to
  the existing targeted deletes.
- **Both teams captained by the host (attendee-a) over a two-actor setup.** One
  account drives create → schedule → record → forfeit. attendee-b stays a pure
  non-host/non-captain viewer, which makes the read-only authz assertion
  unambiguous (mirrors the bracket phase, where both walk-in teams were the
  host's).
- **Insert into `event_team_entries`, not the older `event_teams`.** The
  tournament seed still writes `event_teams`, but the league loaders
  (`loadLeagueTeamsByDivision`) and `bracketRepo.listRegisteredTeams` — which
  feed the forfeit panel and the schedule's home/away pickers — read
  `event_team_entries` (`source='roster'`, non-null `team_id`).
- **Wide, currently-live event window (starts −1h, ends +21d).**
  `LeagueSchedule.addMatch` rejects a match whose `scheduled_at` falls outside
  `[startsAt, endsAt]`, and the UI's naive `datetime-local` → server
  `new Date()` parse can skew by the server's TZ offset. A wide window absorbs
  the skew so a "+2 days" match always lands inside.
- **Asserted the forfeit toggle via button counts, not row scoping.** The
  "League teams" panel nests team `<li>`s inside division `<li>`s, so a
  name-filtered locator matches both. Counting "Mark forfeited" (2 ↔ 1) and
  "Reinstate" (0 ↔ 1) across the toggle is unambiguous and reads as the
  behaviour.
- **`test.skip` (loud, infra-gated), not `test.fixme`.** Because there is no
  non-admin way to stand a league up, a run without `E2E_CLEANUP_SUPABASE_*` /
  `TEST_USER_EMAIL` legitimately cannot exercise leagues. This is the
  reliability contract's sanctioned infra-gate exception — counted against the
  skip budget, with a message that names the missing env.

## What changed

- **`_helpers/league.ts` (new)** — `leagueFixtureAvailable()` (admin client +
  host email present), `createLeagueFixture()` (resolves attendee-a's id via
  `auth.admin.listUsers`, then inserts `events` (`type='league'`, EWKT `geo`) +
  one `roster` `event_divisions` + N `teams` + `team_members` +
  `event_team_entries`), `deleteLeagueFixture()` (event CASCADE + standalone
  team hard-delete).
- **`league.authed.spec.ts` (new, 3 tests)** — (1) host adds a Week-1 match
  then records 25–10 through the RLS-gated RPC; (2) attendee-b sees the
  schedule read-only (no add form / disclosure / score inputs); (3) host marks
  a team forfeited then reinstates it.
- **Docs** — `docs/audits/e2e-tests.md` (status block, C2 RESOLVED note, game
  plan row, remediation log), `docs/audits/README.md` index row, e2e
  `README.md` layout entry.

## Patterns observed

- **A feature can exist end-to-end at the data + UI-read layer while having no
  UI _write_ path.** Leagues render a schedule, a forfeit panel, and an
  RLS-gated record RPC, but you cannot create one or register a team without
  raw inserts. When provisioning a fixture, verify the create/registration
  path exists in the UI before assuming the bracket-style "drive it all through
  the browser" approach transfers.
- **Audit framings age.** C2 said "schedule generation, standings, forfeit."
  The built surface has neither auto schedule-generation (the forfeit action's
  own comment defers it) nor a standings UI (the only `standings` code is
  bracket-only). Read the code, not just the audit line, before writing the
  test — "standings after a result" became "the recorded score + `Final`
  status render on the schedule row."
- **Typed `.insert(...)` against the generated `Database` types is a cheap
  correctness net for raw fixtures.** Because the e2e tsc throwaway compiled
  the helper clean, every required column, enum value, and the `geo` write were
  validated without a live run — a missing column or bad enum would have been a
  compile error.

## Follow-ups

- **Live dev run still to confirm** — no creds here, and the tests mutate via
  the admin client + drive geocoded inserts. Same hand-off state as Phases 1
  and 0. ([e2e-tests.md](../audits/e2e-tests.md) C2.)
- **Captain-can-record (positive RLS) path** — the spec covers host-records and
  non-host-can't-see; a captain successfully recording via the RPC (the other
  half of the `league_schedule_matches_update` policy) is unverified at the UI
  level because the schedule renders the result form to hosts only. Best left
  to an application/RLS-layer test. ([e2e-tests.md](../audits/e2e-tests.md) C2.)
- **Phase 3 (divisions, C4)** is next per the game plan.
