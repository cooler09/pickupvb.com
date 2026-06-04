# E2E tests — quality & coverage audit

> **Status (2026-05-30):** Coverage pass + phased game plan. The 2026-05-25
> audit below was a DRY/SOLID review of the test _code_; this pass adds the
> missing _coverage_ lens and a roadmap. **The DRY/SOLID findings stand —
> read them too**; the coverage section just sits on top.
>
> **What landed since 2026-05-25:** the `_helpers/` layer now exists —
> [auth.ts](../../apps/web/tests/e2e/_helpers/auth.ts) (`defineAuthSetup` /
> `skipIfMissingAuth`), [paths.ts](../../apps/web/tests/e2e/_helpers/paths.ts)
> (`STORAGE_PATHS`), [predicates.ts](../../apps/web/tests/e2e/_helpers/predicates.ts)
> (`isVisibleOrTimeout`), [event-create.ts](../../apps/web/tests/e2e/_helpers/event-create.ts)
> (`createFreeOpenPlayEvent` / `createPaidEvent` / `cancelEvent` /
> `pickFutureDateTime`), [cleanup.ts](../../apps/web/tests/e2e/_helpers/cleanup.ts)
> (opt-in admin deletes), and [stripe.ts](../../apps/web/tests/e2e/_helpers/stripe.ts)
> (Checkout drivers). That **resolves P2 #4, #5, #7** and the proposed
> `events.ts` helper — see the remediation log. **Resolved since** (Phase 0
> increments A + B): the `.catch(() => false)` / `networkidle` sweep (C7),
> `navigation.ts` (#6), `browser.ts` / `withAuthContext` (#8), the
> `isVisibleOrTimeout` no-op-timeout fix, the skip-budget guard (C1), and
> (increment C) per-worker storage state (#3). **Phase 0 is complete.**
>
> **Phase 1 (brackets, C3) is also done:** [bracket.authed.spec.ts](../../apps/web/tests/e2e/bracket.authed.spec.ts)
> (4 tests) self-provisions a disposable tournament via walk-in teams and asserts
> result-advances-winner, a read-only board for a non-host/non-captain viewer
> (UI-level authz), record-all → champion, and reset-reverts-and-clears-downstream.
>
> **Phase 2 (leagues, C2) is also done:** [league.authed.spec.ts](../../apps/web/tests/e2e/league.authed.spec.ts)
> (3 tests) + [\_helpers/league.ts](../../apps/web/tests/e2e/_helpers/league.ts). Leagues
> have **no UI provisioning path at all** (the `/events/new` type chooser offers only
> Open Play / Tournament; the signup area renders nothing for `type === 'league'`), so
> the helper self-provisions the league (event + roster division + N rostered teams) via
> the opt-in service-role admin client and the spec drives the schedule / forfeit
> surfaces through the real UI. Tests: host adds a match → records the result through the
> RLS-gated `record_league_match_result` RPC; a non-host viewer sees the schedule
> read-only; host forfeits and reinstates a rostered team. **Reality-check:** the audit
> framed C2 as "schedule gen, standings, forfeit," but the _built_ surface is narrower —
> hosts add matches **manually** (no auto schedule-generation), there is **no standings
> UI** (standings code is bracket-only), so "standings" is exercised as "the recorded
> score + Final status render on the schedule row." Live dev run still to confirm.
> Next: Phase 3 (divisions, C4).
>
> **Headline:** the suite is _broad_ (~30 specs, ~180 `test()` cases) but
> _shallow exactly where the risk is_. The newest, highest-stakes features —
> **leagues, brackets, divisions, payments** — are read-only page-loads plus
> `test.fixme` placeholders, so a green run exercises **zero** mutating
> tournament or payment paths. The reliability spine is **C1**: the
> defensive-skip / `test.fixme` habit that lets _absent_ coverage report as
> green. Direction set with the maintainer (2026-05-30): **self-provisioning
> tests** (each mutating test creates and tears down its own fixture) over a
> shared seed, and **all four feature areas in scope**. Game plan in the next
> section.

> **Status (2026-05-25):** New audit. Triggered by repeated remediation
> loops on `event-host.authed.spec.ts` (co-host add/remove) where
> `waitForLoadState('networkidle')` and copy-pasted selectors caused
> false negatives. Scope: every spec under
> [apps/web/tests/e2e/](../../apps/web/tests/e2e/) plus the seven
> `auth.*.setup.ts` files and [playwright.config.ts](../../apps/web/playwright.config.ts).
>
> Headline: the suite has grown to ~30 specs without an
> `_helpers/` / page-object layer. Each new spec copies idioms from the
> nearest sibling and small drift accumulates. Two findings (`networkidle`
> waits, defensive `.catch(() => false)`) are actively causing flake.
> The auth-setup-factory and per-worker-storage-state extractions are the
> highest-leverage P2s.

## Coverage audit & game plan (2026-05-30)

### Method & confidence

Built from the verified file inventory under
[apps/web/tests/e2e/](../../apps/web/tests/e2e/), the per-spec
`test()` / `.skip` / `test.fixme` counts, and the helper inventory.
File-level links are exact; **line anchors are intentionally omitted** in
this section because the `test.fixme` blocks move every bundle. The
[e2e README](../../apps/web/tests/e2e/README.md) "Unblocking skipped tests"
section is the companion blocker taxonomy and stays the source of truth for
_why_ a given flow is parked.

### Current coverage snapshot

Depth legend — ✅ exercises a mutating flow · 🟡 read-only / page-load ·
⛔ none (or `test.fixme` only).

| Feature area                  | Primary spec                                                                    | Depth | Note                                                                |
| ----------------------------- | ------------------------------------------------------------------------------- | :---: | ------------------------------------------------------------------- |
| Public smoke / nav / auth     | `smoke` · `navigation` · `auth.public` · `auth-extended.public`                 |  🟡   | Appropriate — GET-only by design                                    |
| Players / groups (public)     | `players.public` · `groups.public`                                              |  🟡   | Directory search + public profile                                   |
| Accessibility / SEO           | `accessibility.public` · `meta-seo.public`                                      |  🟡   | Viewport, focus, theme, meta tags                                   |
| Profile edit                  | `profile` · `profile-edit`                                                      |  ✅   | Edit + restore display name / city / handle / prefs                 |
| Event create + RSVP           | `events`                                                                        |  ✅   | `/events/new`, RSVP join/leave                                      |
| Host management               | `event-host`                                                                    |  ✅   | Create/edit/cancel/cohost — but brittle (see #9 SRP)                |
| Event attendance              | `event-attendance`                                                              |  🟡   | Position RSVP only; **paid / capacity / tip = fixme**               |
| Teams                         | `teams`                                                                         |  🟡   | Create `@destructive`; **invite / remove / broadcast = fixme**      |
| Groups / community            | `groups` · `groups-manage` · `community`                                        |  ✅   | Follow, create+delete listing; **members flow partly fixme**        |
| Hero images                   | `hero-image`                                                                    |  ✅   | Upload/remove on profile / event / group                            |
| Authorization / visibility    | `authorization` · `visibility-gating`                                           |  ✅   | Redirect / guard assertions                                         |
| Notifications                 | `notifications`                                                                 |  🟡   | Bell + panel; **worker / reminders / email = ⛔**                   |
| Billing / Pro                 | `billing-stripe`                                                                |  🟡   | Page loads only                                                     |
| **Brackets**                  | `tournament`                                                                    |  🟡   | Page-load only; **6 bracket mutations = fixme** (incl. advancement) |
| **Divisions**                 | `tournament`                                                                    |  ⛔   | Create-only; registration/winner = fixme                            |
| **Leagues**                   | _none_                                                                          |  ⛔   | Zero references anywhere — not even a fixme                         |
| **Standalone brackets**       | `standalone-bracket`                                                            |  ✅   | ADR 0025: UI self-provision create→add→seed→generate→record→watch   |
| **Payments / Stripe**         | `billing-stripe` · `event-attendance` · `refund-window-gating`                  |  ⛔   | `stripe.ts` helper exists; every paid flow is fixme                 |
| Admin                         | `admin`                                                                         |  ⛔   | All fixme — needs multi-actor fixtures                              |
| Schedule / scoreboard / tools | _none_ (`events/[id]/schedule`, `tools/scoreboard`)                             |  ⛔   | No spec                                                             |
| Short links / claim           | partial (`/e/<code>` via `tournament`)                                          |  ⛔   | `s/[code]`, `claim/` untested                                       |
| CSV / API routes              | _none_ (`api/.../statement.csv`, `api/events/[id]/join`, `api/notifications/*`) |  ⛔   | No request-context coverage                                         |

### Coverage findings (graded)

#### C1 (P1) — Defensive skips + `test.fixme` placeholders let absent coverage pass green

The suite's biggest risk isn't a flaky test — it's a _green_ test that runs
nothing. `test.fixme` bodies are empty and always skip; precondition probes
`test.skip` when ambient data is missing. The worst offenders by skip/fixme
density: [tournament.authed.spec.ts](../../apps/web/tests/e2e/tournament.authed.spec.ts)
(read-only + ~14 fixme), [event-attendance.authed.spec.ts](../../apps/web/tests/e2e/event-attendance.authed.spec.ts),
[teams.authed.spec.ts](../../apps/web/tests/e2e/teams.authed.spec.ts),
[billing-stripe.authed.spec.ts](../../apps/web/tests/e2e/billing-stripe.authed.spec.ts),
[admin.authed.spec.ts](../../apps/web/tests/e2e/admin.authed.spec.ts),
[groups-manage.authed.spec.ts](../../apps/web/tests/e2e/groups-manage.authed.spec.ts).

**Fix (the reliability contract — see below):** convert each fixme to a
self-provisioning test that creates and tears down its own fixture, and make
a missing precondition that the test _should have created_ a hard **failure**,
not a skip. Reserve `test.skip` for sanctioned infra gates only (Stripe test
run, email inbox, deploy-flag), gate those behind explicit env flags, and add
a **skip-budget** guard so a regression can't silently inflate the skip count.

#### C2 (P1) — Leagues: zero coverage

> **Resolved 2026-05-30 (Phase 2).** New
> [league.authed.spec.ts](../../apps/web/tests/e2e/league.authed.spec.ts) (**3 tests**) +
> [\_helpers/league.ts](../../apps/web/tests/e2e/_helpers/league.ts). **Key constraint
> discovered:** leagues have **no UI create or team-registration path** — the event-type
> chooser offers only Open Play / Tournament and the event-detail signup area skips
> `type === 'league'` entirely. So the bracket phase's "self-provision through the UI"
> shape is impossible here; the helper instead inserts the league (event + one `roster`
> division + N rostered teams captained by the host) through the **opt-in service-role
> admin client** (`E2E_CLEANUP_SUPABASE_*`, the same client `cleanup.ts` uses) and the
> spec drives only the schedule + forfeit UI. Each test owns + tears down its fixture
> (`deleteLeagueFixture` CASCADEs the event; standalone teams are hard-deleted). The
> three tests: (1) host adds a match then records 25–10 through the user-scoped,
> RLS-gated `record_league_match_result` RPC; (2) a non-host/non-captain viewer
> (attendee-b) sees the schedule **read-only** — no add form, no result-entry disclosure,
> no score inputs (the schedule renders result entry to hosts only); (3) host **marks a
> team forfeited** in the host-tools "League teams" panel then **reinstates** it (toggle
> verified via button counts). **The audit's framing was partly aspirational:** there is
> no auto schedule-generation (hosts add matches by hand) and no league standings UI
> (standings code is bracket-only), so "standings after a result" is covered as the
> recorded score + `Final` status rendering on the schedule row. Because there is no
> non-admin way to stand a league up, the whole spec is a **sanctioned infra-gated skip**
> when the admin client isn't configured — loud, counted against the skip budget, not a
> silent `test.fixme`. Live dev run still to confirm.

No league spec exists; the only references are zero — not one `test.fixme` exists in
[tournament.authed.spec.ts](../../apps/web/tests/e2e/tournament.authed.spec.ts).
This is the newest feature area (journal: `league-schedule-ui`,
`league-team-forfeit`, `p1-2-league-schedule`) and the match-result write path
is a `SECURITY DEFINER` RPC (`record_league_match_result`), exactly where a
silent RLS/authorization regression would hide.

**Fix:** new `league.authed.spec.ts`. Self-provision a league event via a new
`createLeague` helper (or a `[E2E]`-prefixed seed), then cover: schedule
generation, standings update after a recorded result, and team forfeit. Drive
[league-team-actions.ts](../../apps/web/src/app/events/[id]/league-team-actions.ts)
and [schedule/actions.ts](../../apps/web/src/app/events/[id]/schedule/actions.ts).

#### C3 (P1) — Brackets: read-only only; advancement + captain RLS untested

> **Resolved 2026-05-30 (Phase 1).** New
> [bracket.authed.spec.ts](../../apps/web/tests/e2e/bracket.authed.spec.ts)
> self-provisions a disposable ad-hoc tournament (host = the default per-worker
> attendee-a) and drives the whole pipeline via the host-only **walk-in team**
> escape hatch — create → seed → generate → record → reset — with one account,
> no Stripe. **Four tests:** (1) a recorded semifinal **advances exactly that
> match's winner into the final** (the winner is the one team appearing in two
> cards); (2) a non-host / non-captain viewer (attendee-b) sees the board
> **read-only** — no result-entry form, no score inputs; (3) recording **all**
> matches resolves a **champion** (🏆 banner + "Final results", nothing left to
> play); (4) **resetting** a recorded semifinal reverts it to unplayed and pulls
> the advanced team back out of the final (recursive downstream clear). The
> authorization assertion is intentionally **UI-level** (the form is only
> rendered to host/captain); the RPC-gate rejection itself
> (`record_bracket_match_result`) stays owned by the DB `SECURITY DEFINER`
> policy + a future application-layer test. The persistent `E2ETFR` seed stays
> read-only. Helper: [\_helpers/tournament.ts](../../apps/web/tests/e2e/_helpers/tournament.ts).
> Live dev run still to confirm (see the increment journal). The only remaining
> bracket fixme in `tournament.authed.spec.ts` is division-winner (Phase 3, C4).

[tournament.authed.spec.ts](../../apps/web/tests/e2e/tournament.authed.spec.ts)
asserts the bracket _page renders_; all six mutations (register / withdraw /
rename / free-agent / seed / **record-result-advances-winner**) are fixme.
Highest-value gap because match-result writes go through the captain-vs-host
authorization path (journal: `captain-rls-match-result`,
`record_bracket_match_result` RPC; AGENTS pitfall #8) and winner advancement
touches a downstream match the caller may not own.

**Fix:** new `bracket.authed.spec.ts`. Self-provision a roster tournament +
division + seeded bracket (a disposable clone — keep the persistent `E2ETFR`
seed for read-only). Assert a recorded result **advances the winner into the
next match**, and assert a non-captain / non-host is **rejected**. Drive
[bracket/actions.ts](../../apps/web/src/app/events/[id]/bracket/actions.ts).

#### C4 (P2) — Divisions: multi-division registration unverified

[division-actions.ts](../../apps/web/src/app/events/[id]/division-actions.ts)
and [record-division-winner-actions.ts](../../apps/web/src/app/events/[id]/record-division-winner-actions.ts)
are untested beyond multi-division _creation_ (registration into a chosen division and the division-winner path are not covered). The multi-division `division_id` requirement (AGENTS
pitfall #6 — the DB trigger only fills it for single-division events) is a
boundary that breaks silently.

**Fix:** `divisions.authed.spec.ts`. Self-provision a 2-division event;
register a team and assert it lands in the **chosen** division; record a
division winner. Pairs naturally with C3 (same tournament fixture).

#### C5 (P2) — Payments / Stripe: helpers exist, no green checkout flow

[stripe.ts](../../apps/web/tests/e2e/_helpers/stripe.ts) already drives the
hosted Checkout (`fillStripeCheckout`, `clickConfirmedSubmit`, `waitForStripeRedirect`, `expectStripeDeclineError`, `pollUiFor`) but
every paid flow is fixme: paid RSVP, team/roster checkout, tips, refund-window
gating, and Pro subscription. Files:
[billing-stripe.authed.spec.ts](../../apps/web/tests/e2e/billing-stripe.authed.spec.ts),
[event-attendance.authed.spec.ts](../../apps/web/tests/e2e/event-attendance.authed.spec.ts),
[refund-window-gating.authed.spec.ts](../../apps/web/tests/e2e/refund-window-gating.authed.spec.ts).

**Fix:** stand up the Stripe-test fixture run — a `stripe-host` with Connect
onboarded ([auth.stripe-host.setup.ts](../../apps/web/tests/e2e/auth.stripe-host.setup.ts)
is already wired) and the permanent dev webhook endpoint (tests do not spawn `stripe listen` — they `pollUiFor` the webhook-driven state after Checkout)
for webhook-driven assertions. Convert the fixmes to real tests gated behind
the existing `shouldSkipStripeTests()` gate — a **genuine** infra gate
(`SKIP_STRIPE_E2E=1` and localhost both opt out) → a sanctioned loud-skip
under the skip budget, not a silent fixme. Use the `4242…` success and
`4000…0002` decline cards already documented in `stripe.ts`.

#### C6 (P3) — Untested surfaces

> **Mostly resolved (2026-06-04).** The **schedule** page is covered by the
> league/Diana specs; the **claim** flow by Zoe (Tier D); **attendees.csv** by
> Mark (Stripe). New [c6-surfaces.public.spec.ts](../../apps/web/tests/e2e/c6-surfaces.public.spec.ts)
>
> - [c6-surfaces.authed.spec.ts](../../apps/web/tests/e2e/c6-surfaces.authed.spec.ts)
>   close the rest: the notification cron routes (`worker` / `reminders` /
>   `outbox-purge`) **401 without the `CRON_SECRET` bearer**, the **receipts /
>   earnings CSV** routes 401 unauthenticated and return a `text/csv` download when
>   authed, the **scoreboard tool** loads, and the **`/s/<code>`** short-link
>   redirects valid room codes to the scoreboard remote (and 404s invalid ones).
>   Remaining: the in-room scoreboard realtime sync + `notifications/subscribe`
>   (push) — deferred with the Realtime suite.

No spec touches: the event **schedule** page (`events/[id]/schedule`),
**scoreboard** tools (`tools/scoreboard` + `/remote`), the **claim** flow
(`claim/`), `s/[code]` short links, **receipts/earnings CSV**
(`api/receipts/[year]/statement.csv`, `api/earnings/[year]/statement.csv`),
and the notification **worker / reminders / outbox** API routes.

**Fix:** add focused smoke specs as each lands in a phase. CSV + API routes
are cheapest asserted via Playwright's `request` context (GET + status +
content-type) rather than a full page nav.

#### C7 (P2) — Reliability remediation incomplete (carries P1 #1 / #2 forward)

> **Update (2026-05-30, increment B):** Phase 0's remaining items are **done.**
> `navigation.ts` (#6) and `browser.ts` / `withAuthContext` (#8) now exist and
> are adopted (see remediation log); the skip-budget guard (C1) is wired into
> `playwright.config.ts` (warn-only until `E2E_SKIP_BUDGET=<N>` is exported, then
> it fails the run when the skip count exceeds N); and the `isVisibleOrTimeout`
> no-op flagged below is **fixed** — it now uses `waitFor({ state: 'visible',
timeout })`, so the `timeout` arg actually polls. Verified: e2e tsc baseline
> unchanged at 23 (identical per-file: tournament 14 / groups-manage 6 /
> auth-extended 2 / player-social 1), `playwright --list` parses all 186 tests.
> **#3 (per-worker storage state) closed in increment C** (per-worker auth
> fixture; see below) — Phase 0 is now done. See the
> [increment-B journal entry](../journal/2026-05-30-bundle-e2e-phase0-increment-b.md).
>
> **Update (2026-05-30):** the **`.catch(() => false)` sweep is done** —
> 42 → 1 suite-wide; the one survivor is a response-promise coercion in
> `event-host`, not a visibility probe. **`networkidle` was already done**
> (the remaining grep hits are comments explaining why it's avoided; zero
> real `waitForLoadState('networkidle')` calls). Both verified type-clean
> (e2e tsc baseline unchanged at 23) and `playwright --list` parses all
> 186 tests. See the remediation log and the
> [Phase 0 increment-A journal entry](../journal/2026-05-30-bundle-e2e-phase0-increment-a.md).
> Still open under C7: the `browser.ts` / `navigation.ts` helpers and the
> skip-budget guard (deferred to a later increment), plus a latent
> follow-up — `isVisibleOrTimeout`'s `timeout` arg is a Playwright no-op
> (`isVisible({ timeout })` is ignored), so it never actually waits.

`isVisibleOrTimeout` exists but isn't fully adopted, and `networkidle`
survives in only ~5 occurrences across 3 specs (`authorization`, `event-host`, `profile-edit`); the larger residue is the ~42 raw `.catch(() => false)` sites, and `isVisibleOrTimeout` is adopted in only 10 specs (e.g.
[event-attendance.authed.spec.ts](../../apps/web/tests/e2e/event-attendance.authed.spec.ts),
[groups-manage.authed.spec.ts](../../apps/web/tests/e2e/groups-manage.authed.spec.ts),
[teams.authed.spec.ts](../../apps/web/tests/e2e/teams.authed.spec.ts),
[regression.authed.spec.ts](../../apps/web/tests/e2e/regression.authed.spec.ts),
[auth-extended.public.spec.ts](../../apps/web/tests/e2e/auth-extended.public.spec.ts)).

**Fix:** finish the sweep — replace remaining `networkidle` with deterministic
assertions and raw `.catch(() => false)` with `isVisibleOrTimeout`. This is
Phase 0 work; it must land before the brittle specs get _more_ flows piled on.

### The reliability contract (self-provisioning)

The pattern every **mutating** test must follow once Phase 0 lands:

1. **Arrange** — create the fixture through a `_helpers` factory
   (`createFreeOpenPlayEvent` today; `createRosterTournament`,
   `createLeague`, `createTeam` to be added). Name it with the `[E2E]` /
   `E2E Test ` prefix so the [cleanup](../../apps/web/tests/e2e/_helpers/cleanup.ts)
   sweep can reclaim leaks.
2. **Teardown** — record the id and delete it in `afterAll`
   (`cancelEvent` / `deleteEventById` / `deleteTeamBySlug`). Cleanup is
   opt-in via `E2E_CLEANUP_SUPABASE_*`; document that requirement next to
   the run command.
3. **Act / assert against the just-created fixture** — never ambient dev
   data. This is what kills the "no event in this environment" skips.
4. **Missing self-provisioned precondition ⇒ `expect(...).toBeTruthy()`
   FAIL**, never `test.skip`. A test that couldn't build its own fixture is
   a _broken test_, and should be loud.
5. **`test.skip` is reserved for sanctioned infra gates** (Stripe run, email
   inbox, deploy flag), each behind an explicit env flag and counted against
   a **skip budget** the run fails on if exceeded.
6. **Keep the persistent `E2ETFA` / `E2ETFR` seeds for read-only assertions;**
   mutations create disposable clones so they never corrupt the shared seed.

### Game plan (phased)

Ordered by risk-reduction per unit of work. Each phase ends green with **no
new silent skips**.

|  Phase   | Theme                  | Findings           | Exit criteria                                                                                                                                                                                                                                                                       |
| :------: | ---------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0** ✅ | Reliability foundation | C1, C7, #3, #6, #8 | **Done** (increments A–C): `networkidle`/`catch` swept; `isVisibleOrTimeout` fixed; `navigation.ts` + `browser.ts` exist + adopted; skip-budget guard wired (warn-only until `E2E_SKIP_BUDGET` set); per-worker auth fixture (#3) — live `--workers=4+` run on dev still to confirm |
|  **1**   | Brackets               | C3                 | Result-advances-winner + captain/host authorization tested against a self-provisioned bracket                                                                                                                                                                                       |
| **2** ✅ | Leagues                | C2                 | **Done:** `league.authed.spec.ts` + `_helpers/league.ts` (admin-client self-provision, no UI create path) — host add-match → record via RLS RPC, non-host read-only, forfeit/reinstate. Live dev run to confirm                                                                     |
|  **3**   | Divisions              | C4                 | Multi-division registration lands in the chosen division; division winner recorded                                                                                                                                                                                                  |
|  **4**   | Payments / Stripe      | C5                 | Paid RSVP, team/roster checkout, tip, refund-window, Pro — green on dev; localhost auto-skips                                                                                                                                                                                       |
|  **5**   | Surface fill-in        | C6                 | schedule, scoreboard, short links, claim, CSV/API smoke                                                                                                                                                                                                                             |

**Phase 0 — Reliability foundation (do first; everything else compounds on it).**
Finish C7's `networkidle`/`catch` sweep. Add the two missing helpers the
multi-actor coverage needs: `browser.ts` `withAuthContext(browser, state, fn)`
(P2 #8) and `navigation.ts` for the duplicated `findOwnedGroupUrl` /
`findCaptainedTeamUrl` / `ensureSearchableDisplayName` (P2 #6). Write the
self-provisioning helpers the later phases consume (`createRosterTournament`,
`createLeague`, `createTeam`) alongside the existing `createFreeOpenPlayEvent`.
Add a skip-budget assertion (fail the run if sanctioned skips exceed N).
Optionally take the per-worker storage-state fix (#3) here so later parallel
suites don't reintroduce the refresh-token race.

**Phase 1 — Brackets (C3).** Highest risk: advancement + captain RLS. One
self-provisioned roster tournament with a seeded bracket; assert winner
advancement and the non-captain/non-host rejection. Split host-flow brittleness
(#9) opportunistically while in this area.

**Phase 2 — Leagues (C2).** New spec + `createLeague`. Schedule generation,
standings after a result, forfeit. Mirror the bracket authorization assertions
for the league RPC.

**Phase 3 — Divisions (C4).** Reuse the Phase-1 tournament fixture; assert
`division_id` routing and the division-winner path.

**Phase 4 — Payments / Stripe (C5).** Stand up the Stripe-test run
(Connect-onboarded host + the permanent dev webhook endpoint; `pollUiFor` after Checkout). Convert the paid fixmes; assert
both the success card and the decline card, plus the refund-window gate.

**Phase 5 — Surface fill-in (C6).** Cheap smoke for the remaining ⛔ surfaces;
CSV/API via the `request` context.

### Open decisions for these phases

1. **Skip budget threshold + CI wiring** — what N, and fail the run or just
   warn? (Recommend: fail above the count of sanctioned infra-gated skips.)
2. **Stripe paid flows in the standard dev run or a separate workflow?** They
   need the permanent dev webhook + a non-localhost target and run slower
   (Checkout round-trip + `pollUiFor`) — likely their own manual /
   nightly job, not the per-deploy `e2e-develop.yml`.
3. **Disposable-clone vs. shared-seed for tournament mutations** — the
   contract says clone; confirm the seed snippet can be parameterized for a
   `[E2E]`-prefixed throwaway so Phase 1/3 don't churn `E2ETFR`.

## Findings

### P1

#### 1. `page.waitForLoadState('networkidle')` everywhere — 50+ sites, primary flake source

Already removed from [authorization.authed.spec.ts](../../apps/web/tests/e2e/authorization.authed.spec.ts#L17)
after it timed out hard against `dev.pickupvb.com` (network is never
idle long enough — analytics beacons + Sentry + Vercel Speed Insights
keep firing past 30s).

Concrete offenders:

- [regression.authed.spec.ts](../../apps/web/tests/e2e/regression.authed.spec.ts#L60) and 7 more in the same file
- [groups.authed.spec.ts](../../apps/web/tests/e2e/groups.authed.spec.ts#L22) and 11 more in the same file
- [event-host.authed.spec.ts](../../apps/web/tests/e2e/event-host.authed.spec.ts#L137) and 9 more in the same file
- [teams.authed.spec.ts](../../apps/web/tests/e2e/teams.authed.spec.ts#L21) and 10 more in the same file
- [profile-edit.authed.spec.ts](../../apps/web/tests/e2e/profile-edit.authed.spec.ts#L88) and 5 more in the same file
- [events-browse.public.spec.ts](../../apps/web/tests/e2e/events-browse.public.spec.ts#L29) and 2 more in the same file

**Fix:** remove every call. Two replacement patterns:

```ts
// 1. If a deterministic element follows, just assert it — locator auto-retries.
await page.goto('/events');
await expect(page.locator('a[href*="/events/"]').first()).toBeVisible();

// 2. If you genuinely need "DOM is parsed", use 'domcontentloaded'.
await page.goto('/some-page', { waitUntil: 'domcontentloaded' });
```

`networkidle` is officially [discouraged by Playwright](https://playwright.dev/docs/api/class-page#page-wait-for-load-state-option-state)
("DISCOURAGED. The 'networkidle' value is not reliable") for exactly
this reason.

#### 2. Defensive `.catch(() => false)` / `.catch(() => {})` masking real failures

30+ sites swallow every error including selector typos and 500s.

- [event-host.authed.spec.ts#L96](../../apps/web/tests/e2e/event-host.authed.spec.ts#L96) — `isVisible({ timeout: 2_000 }).catch(() => false)` for the host-action probe
- [authorization.authed.spec.ts#L43](../../apps/web/tests/e2e/authorization.authed.spec.ts#L43) — same pattern, host-page detection
- [groups.authed.spec.ts#L141](../../apps/web/tests/e2e/groups.authed.spec.ts#L141)
- [hero-image.authed.spec.ts#L35](../../apps/web/tests/e2e/hero-image.authed.spec.ts#L35)
- [player-social.authed.spec.ts#L65](../../apps/web/tests/e2e/player-social.authed.spec.ts#L65)
- Multiple `await ctx.close().catch(() => {})` in teardown

**Fix:** narrow the swallow to the expected error class. Helper in
`tests/e2e/_helpers/predicates.ts`:

```ts
// Treats only TimeoutError as "not visible". Anything else (e.g. strict-mode
// violation, navigation, target closed) rethrows so failures surface.
export async function isVisibleOrTimeout(locator: Locator, timeout = 2_000): Promise<boolean> {
  try {
    await locator.waitFor({ state: 'visible', timeout });
    return true;
  } catch (err) {
    if (err instanceof Error && /Timeout|exceeded/.test(err.message)) return false;
    throw err;
  }
}
```

For teardown, accept only `Target closed` / `already closed`; rethrow
everything else.

#### 3. Supabase refresh-token race + shared storageState

> **Resolved 2026-05-30 (increment C).** Per-worker auth landed in
> [\_helpers/fixtures.ts](../../apps/web/tests/e2e/_helpers/fixtures.ts): one
> **independent** attendee-a sign-in per worker → `worker-<parallelIndex>.json`,
> with the test-scoped `storageState` overridden to return it. The 20 authed
> specs import `test` from the fixture (pure import-path swap), and the `workers`
> cap is lifted (`undefined` locally; **CI stays `1` by choice**, not for the
> race). This is Playwright's documented "account per parallel worker" recipe, so
> the fix is structural — but a live `--workers=4+` run against dev is still
> needed to confirm the race is gone in practice, and the secondary roles
> (attendee-b / hosts / admin) still share files (follow-up). See the
> [increment-C journal](../journal/2026-05-30-bundle-e2e-phase0-increment-c.md).

[playwright.config.ts#L31-L40](../../apps/web/playwright.config.ts#L31-L40)
documents the issue: `fullyParallel: true` + shared `STORAGE_STATE` +
Supabase rotating refresh tokens = workers stomping each other's
sessions. Workaround is `workers: 2` (or 1 on CI) which leaves
parallelism on the table.

**Fix (proper):** per-worker storage state. Two options:

1. Run a small pre-suite that exchanges the saved access token for N
   independent sessions (one per worker) using Supabase admin API, and
   write `.playwright/.auth/user-<i>.json`. The authed project picks
   one by `testInfo.workerIndex`.
2. Switch authed specs to a [Playwright fixture](https://playwright.dev/docs/test-fixtures)
   that calls `signInProgrammatically(workerIndex)` and stores the
   result in a per-worker file, then reuses it for every test on that
   worker.

Until then, **document the workers=2 ceiling as a P1 known limitation**
(not just a config comment) so future contributors don't crank it up
chasing throughput.

### P2

#### 4. Seven near-identical `auth.*.setup.ts` files

[auth.setup.ts](../../apps/web/tests/e2e/auth.setup.ts),
[auth.attendee-b.setup.ts](../../apps/web/tests/e2e/auth.attendee-b.setup.ts),
[auth.free-host.setup.ts](../../apps/web/tests/e2e/auth.free-host.setup.ts),
[auth.pro-host.setup.ts](../../apps/web/tests/e2e/auth.pro-host.setup.ts),
[auth.stripe-host.setup.ts](../../apps/web/tests/e2e/auth.stripe-host.setup.ts),
[auth.admin.setup.ts](../../apps/web/tests/e2e/auth.admin.setup.ts) —
differ only in `EMAIL`, `PASSWORD`, and `STORAGE_STATE`.

**Fix:** factory in `tests/e2e/_helpers/auth.ts`:

```ts
export function defineAuthSetup(opts: {
  email: string | undefined;
  password: string | undefined;
  storagePath: string;
  role: string;
}) {
  setup(`authenticate ${opts.role}`, async ({ page }) => {
    if (!opts.email || !opts.password) {
      setup.skip(true, `${opts.role}: env vars missing`);
      return;
    }
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(opts.email);
    await page.getByLabel(/password/i).fill(opts.password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/(events|profile)/, { timeout: 15_000 });
    fs.mkdirSync(path.dirname(opts.storagePath), { recursive: true });
    await page.context().storageState({ path: opts.storagePath });
  });
}
```

Each setup file collapses to two lines.

#### 5. `fs.existsSync(STATE_PATH); test.skip()` boilerplate in ~15 places

Same lines repeat across [event-host.authed.spec.ts#L274](../../apps/web/tests/e2e/event-host.authed.spec.ts#L274),
[groups.authed.spec.ts#L246](../../apps/web/tests/e2e/groups.authed.spec.ts#L246),
[event-attendance.authed.spec.ts#L26](../../apps/web/tests/e2e/event-attendance.authed.spec.ts#L26),
[player-social.authed.spec.ts#L220](../../apps/web/tests/e2e/player-social.authed.spec.ts#L220),
[regression.authed.spec.ts#L115](../../apps/web/tests/e2e/regression.authed.spec.ts#L115),
[groups-manage.authed.spec.ts#L217](../../apps/web/tests/e2e/groups-manage.authed.spec.ts#L217).

**Fix:** `skipIfMissingAuth(STORAGE_PATHS.attendeeB, 'attendee-b')` in
the same helper module.

#### 6. Page-object helpers copy-pasted between sibling specs

- `findOwnedGroupUrl` exists in [groups.authed.spec.ts#L20](../../apps/web/tests/e2e/groups.authed.spec.ts#L20) **and** [groups-manage.authed.spec.ts#L30](../../apps/web/tests/e2e/groups-manage.authed.spec.ts#L30) — file source comment literally says "Mirrors the helper in groups.authed.spec.ts".
- `ensureSearchableDisplayName` duplicated in [groups.authed.spec.ts#L39](../../apps/web/tests/e2e/groups.authed.spec.ts#L39) and [teams.authed.spec.ts#L46](../../apps/web/tests/e2e/teams.authed.spec.ts#L46).
- `findCaptainedTeamUrl` ([teams.authed.spec.ts#L27](../../apps/web/tests/e2e/teams.authed.spec.ts#L27)) follows the same shape and would benefit from the same module.

**Fix:** extract to `tests/e2e/_helpers/navigation.ts` and import from both.

#### 7. Storage-state path math duplicated

Every authed spec recomputes `path.join(__dirname, '..', '..', '.playwright', '.auth', '<name>.json')`. If `.playwright/.auth/` ever moves (or we add a per-worker suffix per finding #3), it's a 10-file change.

**Fix:** central `tests/e2e/_helpers/paths.ts` exporting
`STORAGE_PATHS.{attendeeA,attendeeB,freeHost,proHost,stripeHost,admin}`.

#### 8. Multi-context boilerplate (`browser.newContext` + `try/finally close`)

[event-host.authed.spec.ts#L281-L304](../../apps/web/tests/e2e/event-host.authed.spec.ts#L281-L304),
[groups.authed.spec.ts#L252-L283](../../apps/web/tests/e2e/groups.authed.spec.ts#L252-L283),
[player-social.authed.spec.ts#L225-L245](../../apps/web/tests/e2e/player-social.authed.spec.ts#L225-L245),
[teams.authed.spec.ts#L167-L181](../../apps/web/tests/e2e/teams.authed.spec.ts#L167-L181)
— each opens a second browser context, runs work, closes in `finally`.
Some swallow `.close()` errors, some don't.

**Fix:**

```ts
// tests/e2e/_helpers/browser.ts
export async function withAuthContext<T>(
  browser: Browser,
  storageState: string,
  fn: (page: Page, context: BrowserContext) => Promise<T>,
): Promise<T> {
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  try {
    return await fn(page, context);
  } finally {
    await context.close();
  }
}
```

#### 9. `event-host.authed.spec.ts` is the suite's largest SRP violation

One file (~500 LOC) creates an event in `beforeAll`, then runs eight
unrelated tests against it (detail, edit, title-change, hosts section,
attendance, cancel, broadcast, co-host add/remove). Brittle because:

- Tests share mutable state — if test N fails mid-mutation, test N+1
  sees an unexpected event.
- Failure diagnosis is muddled (which test left the title wrong?).
- The recent co-host remediation cycle would have been faster against
  a focused 1-test-per-flow file.

**Fix (incremental):** split into `event-host.detail.authed.spec.ts`,
`event-host.edit.authed.spec.ts`, `event-host.cohost.authed.spec.ts`,
etc. Each owns its own `beforeAll` event via a shared
`createTestEvent(page, overrides?)` helper. Keep the cancel-in-afterAll
pattern.

Don't do this until findings #1–#4 land — moving brittle code around is
busywork.

### P3

#### 10. `test.fixme` density — 20+ placeholders cluttering the suite

[tournament.authed.spec.ts#L85-L131](../../apps/web/tests/e2e/tournament.authed.spec.ts#L85-L131) alone has 14;
[event-attendance.authed.spec.ts#L116-L308](../../apps/web/tests/e2e/event-attendance.authed.spec.ts#L116-L308) has 6.
README already documents most as "needs Stripe / needs second account /
needs inbox sandbox" under "Unblocking skipped tests".

**Fix:** move the test-intent docs into [apps/web/tests/e2e/README.md](../../apps/web/tests/e2e/README.md)
or a `docs/e2e-coverage-gaps.md` and delete the placeholder bodies.
The current state — placeholders that always skip — gives a false sense
of "we have a test for that".

#### 11. `console.error` in test source

[event-host.authed.spec.ts#L125](../../apps/web/tests/e2e/event-host.authed.spec.ts#L125)
prints inside `beforeAll` failure path. Reporter already shows the
error; the `console.error` is noise.

**Fix:** delete it.

#### 12. Dead `ATTENDEE_A_STATE` constant

[event-attendance.authed.spec.ts#L31](../../apps/web/tests/e2e/event-attendance.authed.spec.ts#L31)
defines `ATTENDEE_A_STATE` and never reads it.

**Fix:** delete (or absorb into `STORAGE_PATHS` from finding #7 and
import what's used).

## Recommended helper module layout

```
apps/web/tests/e2e/_helpers/
├── paths.ts          STORAGE_PATHS, AUTH_DIR constants (P2 #7)
├── auth.ts           defineAuthSetup, skipIfMissingAuth (P2 #4, #5)
├── browser.ts        withAuthContext (P2 #8)
├── predicates.ts     isVisibleOrTimeout (P1 #2)
├── navigation.ts     findOwnedGroupUrl, findCaptainedTeamUrl,
│                     ensureSearchableDisplayName (P2 #6)
└── events.ts         createTestEvent, cancelTestEvent (enables P2 #9 split)
```

Underscore prefix matches the Next App-Router co-location convention so
it's instantly familiar.

## Open questions

1. **Page-object class vs. plain functions?** Plain functions
   (`signOut(page)`, `getHostsList(page)`) are cheaper and avoid
   constructor noise; classes (`new EventDetailPage(page).hostsList`)
   give better IDE auto-complete at scale. Suggest functions for now,
   re-evaluate if helper count crosses ~40.
2. **Per-worker storage state vs. single worker.** The right answer is
   per-worker (finding #3) but if the Stripe e2e work lands first it
   becomes harder to retrofit. Decide before scaling the suite.
3. **Stripe placeholder strategy.** Drop the `test.fixme`s now and
   re-add when the Stripe-test fixture work lands, or keep them as
   inline TODOs? Leaning drop.

## Remediation log

### 2026-06-04 — C6 surface smoke (untested routes/tools)

New `c6-surfaces.public.spec.ts` (8) + `c6-surfaces.authed.spec.ts` (2) close the
cheap half of C6 via `request`-context + light page-loads: notification cron
routes (`worker`/`reminders`/`outbox-purge`) 401 without the `CRON_SECRET`
bearer; receipts + earnings `statement.csv` 401 unauthenticated and return a
`text/csv` attachment when authed; the scoreboard tool loads; `/s/<code>`
redirects a valid room code to the scoreboard remote and 404s an invalid one.
Author + static-verify (playwright `--list` + e2e tsc, 0 new errors). See the C6
status block above for what each surface now covers and what's deferred (in-room
realtime sync, push `subscribe`).

### 2026-06-04 — Persona `test.fixme` graduation (rounds 1 & 2)

Converted persona-spec `test.fixme` stubs into runnable specs where the
underlying feature exists and is reachable by ≤ 2 accounts, and **documented the
rest below** so the remaining stubs aren't silent. Author + static-verify only
(playwright `--list` + a throwaway tsconfig including `tests/**`, since e2e is
excluded from `pnpm typecheck`/`lint`); **not run against dev** this pass — the
specs mirror already-green patterns to de-risk that.

**Implemented (13 specs across 8 personas):**

- **Diana** — add a Week-1 match + record score; forfeit/reinstate (re-homed the
  proven `league.authed.spec.ts` flows; `createLeagueFixture` gained an optional
  `hostEmail`).
- **Hannah** — capacity-full boundary (capacity-1 event, a contender is blocked
  with the `?rsvp=full` flash). `createFreeOpenPlayEvent` gained `maxSpots` +
  `joinAsHost`.
- **Sofia** — round-robin, double-elim, pool-play→playoff formats
  (`createBracketToDraft`/`createAndGenerateBracket` gained `{ format }`,
  `recordAllPlayableMatches`).
- **Olivia** — follow/unfollow + self-friend invariant; `friends_of_host`
  visibility scoping (new `_helpers/scoped-event.ts`; **surfaced a real
  visibility leak**, fixed in the event-detail loader — see the
  `event-detail-visibility-leak` memo).
- **Zoe** — hide/unhide a community listing (new `_helpers/community.ts`).
- **Priya** — RSVP into the libero slot; over-fill → "Waitlist" (the genuine
  waitlist in this app; new `_helpers/positional-event.ts`).
- **Steve** — co-host can reach the edit + manage pages; payouts route to the
  primary host, never the co-host's earnings (new `_helpers/co-hosted-event.ts`).
- **Tyler** — registers as a free agent in a division pool (reuses the league
  fixture; `event_divisions.allow_free_agents` defaults true).

Shared `resolveUserIdByEmail` promoted to `cleanup.ts`. New admin-client
event fixtures (`scoped-event`, `positional-event`, `co-hosted-event`) each
clone the league fixture's `events` insert — **follow-up: extract a shared
`insertPublishedEvent(overrides)` to pay down that duplication.** Note the
`events.position_roster` column is in the DB (migration `20260514000600`) but
stale in the generated **events** type (carried only on `event_divisions`), so
the positional fixture casts through a typed base.

**Tier A follow-up (2026-06-04, same workstream).** The two **Already covered**
rows below are now converted to `— see teams.authed.spec.ts` pointers (Adam
invite→accept, Bianca broadcast), matching Amy's intentional-pointer convention:
the persona specs read completely without a placeholder that implies missing
coverage. No new test code — title + comment only; `playwright --list` re-parses
both specs.

**Tier B follow-up (2026-06-04).** Olivia's `friends_of_attendees` discovery is
**graduated to a real test** (the row below is ✅). `createFriendsOfAttendeesEvent`
in `_helpers/scoped-event.ts` provisions the host + attendee + viewer, one solo
division, an `event_participants` attendee row, and the attendee→viewer edge the
RLS gate keys on (the gate is `event_has_attendee_friend`, joining
`event_participants → event_divisions → friendships` — **not** `event_attendees`
as the earlier follow-up note loosely said). The spec asserts the positive
(Olivia, friend of the attendee) loads it and the negative (Adam / attendee-b)
`notFound()`s. Author + static-verify only (playwright `--list` + e2e tsc, 0 new
errors against the 20-error baseline); run on dev to confirm.

**Tier C follow-up (2026-06-04).** All four Tier-C rows are **graduated** on a new
`_helpers/roster-tournament.ts` fixture:

- **Captain team-registration (Adam + Bianca)** → two real tests driving
  `TournamentSignupPanel` → `?team=registered`. Single roster division, so
  `division_id` rides the hidden input; the multi-division "lands in the chosen
  division" assertion stays owned by the divisions phase (C4).
- **Free-agent "pickup" (Bianca + Tyler)** → **the finding:** there is **no
  first-class free-agent → roster pickup** in the product. The pool is
  advertise-only and `free-agent-actions.ts` exposes only join/leave; a captain
  rosters a player through the generic team-invite (`teams/actions.ts`
  `addMemberFromForm` → `team.invite` notify → accept). Rather than fake a
  pickup feature, the persona narrative is covered by **one multi-actor
  end-to-end test** (Tyler advertises → Bianca invites via the team invite →
  Tyler is notified → joins), which also **asserts the seam**: the invite does
  not clear Tyler's pool entry. A real pool-integrated pickup (clearing the pool
  - a pickup-specific notification) remains a **Bucket-3 product build**.

**Tier D follow-up (2026-06-04).** Three more rows **graduated** (all feature-confirmed,
unlike the Tier-C pickup):

- **Mark sponsor logo** → Pro host edits an event, the `SponsorPanel` is unlocked
  (Pro, not the $3 à-la-carte), a real `setInputFiles` logo upload + save → `?sponsor=saved`.
- **Zoe community-listing claim approval** → new `_helpers/community-claim.ts`
  admin-provisions an `active` city-bearing listing + a matching host event (the
  `matchesByDateAndCity` gate forces same-day/same-city) submitted by a _different_
  account (the claim form hides for the submitter); the claimant files the claim,
  Zoe approves.
- **Diana league host-add** → confirmed the `HostAdHocTeamsPanel` renders on
  `/events/[id]/manage` for a league roster division (ADR 0033). Adds a walk-in
  team, marks it paid (cash).

The two remaining **feature-absent** rows (Diana playoff-from-standings, Zoe
role-escalation) are confirmed unbuilt — no standings→bracket UI, no admin
user-management page — and stay `test.fixme` with the gap recorded (Bucket-3
product builds, not test gaps).

**Stripe follow-up (2026-06-04).** Built on the existing `_helpers/stripe.ts`
harness (same webhook bridge `event-attendance.authed.spec.ts` uses — no new
fixture, just persona-level tests). All `shouldSkipStripeTests()`-gated (localhost

- `SKIP_STRIPE_E2E=1` opt out). **Graduated:**

* **Marcus** paid-buyer — buy→roster+**receipt**, **decline**, **tip** (tip-jar
  → Checkout → `tip=thanks`), and the **inside-window auto-refund** (cancel →
  `charge.refunded` webhook → off roster + refunded receipt).
* **Mark** Pro attendee-CSV export — paid event + a real buyer (Marcus) → Mark
  GETs `/api/events/[id]/attendees.csv` and asserts the CSV + a paid row.

**Subscription follow-up (2026-06-04).** **Rachel ×4 graduated** on a new
`_helpers/host-subscription.ts` (admin-client flip of `host_subscriptions.status`
with save/restore, mirroring `set-host-subscription.mjs`, plus bracket/paid-event
cap-arming fixtures) — no Stripe webhooks needed: Pro-perk loss on lapse, the
standalone-bracket cap, and the rolling-30d paid cap (×2, incl. the cancelled-
event abuse guard). **Writing the paid-cap tests surfaced a real bug:**
`host_paid_event_count_30d` referenced the dropped `events.price_cents`, so the
free-tier paid-event cap was **silently disabled** — fixed in migration
`20260913000000` (count via `event_divisions.price_cents`). See
[the journal entry](../journal/2026-06-04-bundle-paid-event-cap-rpc-fix.md).
⚠️ **Behavioural:** the fix re-enables the cap for free hosts (the documented,
intended behaviour) — review the migration before shipping.

**Still open** (each needs more than a buyer flow): **Marcus outside-window
refund** (near-future `pickNearFutureDateTime` helper) and **Nina**
publish-after-onboarding (in-test Connect onboarding — hardest). **Julie's 30d
cap is now done** — the cap-RPC fix + `armPaidEvent` removed the Stripe / stateful
blocker (it's a second regression for that fix).

**Remaining persona `test.fixme` backlog (12).** Grouped by what's actually
blocking each — most need a product decision, the Stripe fixture, or a second
live actor, not just test code (the **Done (pointer)** rows are deliberate dedup,
not gaps; the **Done (Tier B/C/D · Stripe)** rows are real tests now; 🟡 = partial):

| Persona | Fixme                                                            | Blocker                              | To graduate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------- | ---------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hannah  | auto-promote off the waitlist                                    | **Feature absent**                   | No capacity waitlist queue / promotion exists in the domain (only the position over-fill badge — `waitlist-not-implemented` memo). Build a queue + `LeaveEvent`→promote handler first.                                                                                                                                                                                                                                                                                                       |
| Steve   | co-host can send a host broadcast                                | ✅ **Done (RLS fix)**                | 2026-06-04: confirmed the inconsistency — co-hosts reach `/manage` + see the `HostBroadcastPanel`, but `broadcasts_insert_event_host` was host-only, so the send hit an RLS rejection. Resolved (option A) in migration `20260914000000`: the insert check now delegates to `is_event_host(audience_id)` (host + co-hosts), matching the bracket/league authz helper. Test: a co-host (Steve) sends → the broadcast row lands under him + no error alert. **Deploy-gated** on the migration. |
| Diana   | playoff bracket from final standings                             | **Feature absent**                   | No standings→bracket UI for leagues. Needs a "generate playoff from standings" surface.                                                                                                                                                                                                                                                                                                                                                                                                      |
| Zoe     | escalate / de-escalate a user role                               | **Feature absent**                   | No admin user-management UI (only `/admin/community-import`). Build the page, then test.                                                                                                                                                                                                                                                                                                                                                                                                     |
| Diana   | host-adds an account-less rostered team + mark paid off-platform | ✅ **Done (Tier D)**                 | 2026-06-04: drives the `HostAdHocTeamsPanel` on `/events/[id]/manage` (renders for a league roster division — `hasHostManagedTeams`, ADR 0033). Adds a walk-in team via the modal, asserts "Added by host" + Unpaid, then "Mark paid (cash)" → Paid. Reuses the league fixture (Diana as host). Author + static-verify; run on dev to confirm.                                                                                                                                               |
| Mark    | sponsor logo (Pro add-on)                                        | ✅ **Done (Tier D)**                 | 2026-06-04: Mark (Pro) creates an event, opens the edit page's `SponsorPanel` (gated — "Save sponsor", not the $3 unlock), uploads a logo via `setInputFiles` (real `sponsor-logos` storage write → preview), fills the name, saves → `?sponsor=saved`. Author + static-verify; run on dev to confirm.                                                                                                                                                                                       |
| Marcus  | buy ticket (4242) → attendee + receipt                           | ✅ **Done (Stripe)**                 | 2026-06-04: reuses the `_helpers/stripe.ts` harness + the `event-attendance` paid pattern (stripe-host stands up a paid event, Marcus buys via `4242`). Persona angle: also asserts the **receipt** on `/profile/receipts`. `shouldSkipStripeTests()`-gated; run on dev to confirm.                                                                                                                                                                                                          |
| Marcus  | declined card rejected                                           | ✅ **Done (Stripe)**                 | 2026-06-04: `4000…0002` → inline decline on `checkout.stripe.com`, Marcus not on roster.                                                                                                                                                                                                                                                                                                                                                                                                     |
| Marcus  | leave a tip (0% platform fee)                                    | ✅ **Done (Stripe)**                 | 2026-06-04: drives the `TipJar` ("Leave a tip" → "Tip $5.00") → Checkout `4242` → `?tip=thanks`.                                                                                                                                                                                                                                                                                                                                                                                             |
| Marcus  | refund window (auto vs host-manual)                              | 🟡 **Partial (inside done)**         | 2026-06-04: the **inside-window auto-refund** is a real test (buy → "Cancel sign-up & refund" → `charge.refunded` webhook removes the roster row → refunded receipt). The **outside-window** host-manual case stays fixme — needs a near-future paid event (`pickNearFutureDateTime`) since the UI date picker can't easily place a start within `refundWindowHours`.                                                                                                                        |
| Julie   | 2nd paid event in 30d blocked by the cap                         | ✅ **Done (cap fix unblocked it)**   | 2026-06-04: the cap-RPC fix (migration `20260913000000`) + the admin `armPaidEvent` fixture removed the blocker — no Stripe needed (the cap fires before the charges check) and no statefulness (the arm is provisioned fresh). Julie is natively free: arm one paid event → `attemptPaidEventExpectCapBlock` asserts a 2nd create is blocked. Shares the helper with the Rachel cap specs; deploy-gated on the migration.                                                                   |
| Nina    | paid event publishes after Stripe onboarding                     | **Stripe fixture**                   | Needs completing **Stripe Connect onboarding in-test** (Stripe's hosted onboarding flow) — the hardest to automate of the cluster.                                                                                                                                                                                                                                                                                                                                                           |
| Mark    | paid multi-division tournament + CSV export                      | ✅ **Done (Stripe)**                 | 2026-06-04: Mark hosts a paid event, Marcus buys (`4242`), Mark GETs `/api/events/[id]/attendees.csv` (the manage-page Export endpoint, Pro-gated) and the test asserts a CSV content-type + the payment header + ≥1 paid attendee row. Simplified from "multi-division tournament" — attendees.csv lists individual attendees; the multi-division depth is C4.                                                                                                                              |
| Rachel  | Pro perks disappear after lapse                                  | ✅ **Done (subscription)**           | 2026-06-04: new `_helpers/host-subscription.ts` flips `host_subscriptions.status` via the admin client (active→Pro, canceled→Free) and restores it after. Asserts the Pro-gated **Templates** affordance on `/events/new` shows (active) then vanishes (canceled).                                                                                                                                                                                                                           |
| Rachel  | standalone-bracket cap → 1 after downgrade                       | ✅ **Done (subscription)**           | 2026-06-04: free Rachel + one admin-armed active bracket → `/brackets/new` renders the upgrade path (`cap.reason` + "Upgrade to Pro"), no "Create bracket" form.                                                                                                                                                                                                                                                                                                                             |
| Rachel  | rolling-30d paid cap re-applies after downgrade                  | ✅ **Done (subscription) + bug fix** | 2026-06-04: **surfaced a real bug** — `host_paid_event_count_30d` read the dropped `events.price_cents`, so the paid cap was silently disabled. Fixed in migration `20260913000000` (count via `event_divisions.price_cents`). Test: free Rachel + one armed paid event → a 2nd paid-event create is blocked by the cap. **Deploy-gated** (needs the migration applied).                                                                                                                     |
| Rachel  | cancelling a paid event doesn't free a slot                      | ✅ **Done (subscription)**           | 2026-06-04: same as above but the armed paid event is `cancelled` — the cap count is status-agnostic, so the slot stays occupied (a 2nd create is still blocked). The abuse guard.                                                                                                                                                                                                                                                                                                           |
| Olivia  | `friends_of_attendees` event discovery                           | ✅ **Done (Tier B)**                 | 2026-06-04: `createFriendsOfAttendeesEvent` added to `_helpers/scoped-event.ts` (host + attendee + viewer; one solo division + an `event_participants` attendee row + the attendee→viewer edge the gate keys on). Spec asserts Olivia (friend of the attendee) loads it, Adam (attendee-b) `notFound()`s. Author + static-verify (playwright `--list` + e2e tsc, 0 new errors); run on dev to confirm.                                                                                       |
| Zoe     | approve a community-listing claim                                | ✅ **Done (Tier D)**                 | 2026-06-04: new `_helpers/community-claim.ts` admin-provisions an `active` city-bearing listing + a matching host event (same day + city — the claim's `matchesByDateAndCity` gate) submitted by a _different_ account so the claim form shows. attendee-b (claimant) files the claim, Zoe (admin) approves → `?notice=claimapproved`. Author + static-verify; run on dev to confirm.                                                                                                        |
| Adam    | registers his team into a division (`division_id`)               | ✅ **Done (Tier C)**                 | 2026-06-04: new `_helpers/roster-tournament.ts` (`createRosterTournamentFixture`) admin-provisions a published tournament + roster division + a captain-owned team; spec drives `TournamentSignupPanel` → `?team=registered`. Single division → `division_id` rides the hidden input. Author + static-verify; run on dev to confirm.                                                                                                                                                         |
| Bianca  | registers Sand Sharks into a division (`division_id`)            | ✅ **Done (Tier C)**                 | Same shape as Adam's (same fixture, captain = Bianca / `TEST_CAPTAIN_EMAIL`).                                                                                                                                                                                                                                                                                                                                                                                                                |
| Bianca  | picks up a free agent (Tyler) into the roster                    | ✅ **Done (Tier C, e2e-via-invite)** | 2026-06-04: one multi-actor end-to-end test (`persona-bianca-captain.authed.spec.ts` "picks up free-agent Tyler …"). **No first-class pool→roster pickup exists** — so Tyler advertises in the pool, Bianca rosters him via the generic team invite (`addMemberFromForm`), and the test asserts the **seam**: inviting him does NOT clear his pool entry (pool + roster stay disconnected). A real pool-integrated pickup remains a Bucket-3 product build.                                  |
| Tyler   | picked up by a captain + roster notification                     | ✅ **Done (Tier C, pointer)**        | Pointer to the Bianca end-to-end test above (it drives both actors and asserts Tyler's `team.invite` notification).                                                                                                                                                                                                                                                                                                                                                                          |
| Adam    | invites a teammate; they accept                                  | ✅ **Done (pointer)**                | 2026-06-04 (Tier A): converted to a `— see teams.authed.spec.ts` pointer. Coverage owned by `teams.authed.spec.ts` "captain invites attendee-b, attendee-b accepts".                                                                                                                                                                                                                                                                                                                         |
| Bianca  | sends a team broadcast to the roster                             | ✅ **Done (pointer)**                | 2026-06-04 (Tier A): converted to a `— see teams.authed.spec.ts` pointer. Coverage owned by `teams.authed.spec.ts` "captain sends a broadcast after attendee-b joins".                                                                                                                                                                                                                                                                                                                       |
| Amy     | RSVPs to an open play and leaves                                 | **Intentional pointer**              | Owned by `events.authed.spec.ts`; deliberate dedup, not a gap.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Greg    | guest RSVP (anon, Turnstile-gated)                               | **Infra-hard (Turnstile)**           | Turnstile site key is domain-bound to dev; the challenge can't be automated from a normal browser context. Needs a Turnstile test-bypass key or a server seam.                                                                                                                                                                                                                                                                                                                               |
| Greg    | claim the guest account → real login                             | **Infra-hard (Turnstile)**           | Depends on the guest RSVP above.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Hannah  | live spot count across 2 viewers (realtime)                      | **Deferred (realtime)**              | Belongs to the deferred Supabase-Realtime suite.                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Journals: [2026-06-03-bundle-persona-e2e-suite](../journal/2026-06-03-bundle-persona-e2e-suite.md),
[2026-06-04-bundle-persona-e2e-fixmes](../journal/2026-06-04-bundle-persona-e2e-fixmes.md).

### 2026-05-31 — Standalone brackets (ADR 0025): create → seed → generate → record → watch

- **New coverage for the post-audit standalone-bracket feature.** ADR 0025
  shipped event-free, owner-scoped brackets after this audit's snapshot was
  taken, and the
  [standalone-brackets journal](../journal/2026-05-30-standalone-brackets.md)
  flagged the explicit gap: _"No e2e yet. A Playwright spec (create → add teams
  → seed → generate → record → open watch link) should be added and run green
  against dev."_ This bundle implements exactly that.
- **New [standalone-bracket.authed.spec.ts](../../apps/web/tests/e2e/standalone-bracket.authed.spec.ts)
  (2 tests) + [\_helpers/standalone-bracket.ts](../../apps/web/tests/e2e/_helpers/standalone-bracket.ts)**
  (`createStandaloneBracket` / `addStandaloneTeams` /
  `seedAndGenerateStandaloneBracket`). Unlike leagues (C2 — no UI provisioning
  path, admin-client fixture), standalone brackets have a full UI create flow at
  `/brackets/new`, so the spec **self-provisions entirely through the UI** as
  the default per-worker attendee-a — one signed-in real user runs the whole
  pipeline (no second actor, no Stripe, no admin client to stand it up).
- **Reuses the scope-agnostic board ops.** `BoardView` / `MatchCard` are the
  same components the event path renders (the standalone page passes
  `scope={kind:'standalone'}`), so `recordFirstPendingMatch` from
  [\_helpers/tournament.ts](../../apps/web/tests/e2e/_helpers/tournament.ts)
  drives the board unchanged. The standalone-specific surface under test is the
  create page, the typed-in-teams modal (`WalkInTeamForm` with
  `showRoster={false}` — a controlled input with no `name` attr, kept open
  across adds), the standalone seed/generate/record server actions (the record
  routes through `record_bracket_match_result`'s **owner branch**), the
  owner-only workspace, and the public watch view.
- **The two tests:** (1) **full pipeline + spectator link** — create a
  best-of-1 single-elim, add 4 teams, seed + generate, record one semifinal
  (winner advances → one team in 2 cards), then **click the workspace's "Open
  public spectator view →" link** and assert the `/brackets/[id]/watch` page
  renders the same live board **read-only** (advanced team in 2 cards, no
  Enter/Edit summary, no score inputs); (2) **owner-only workspace** — a
  signed-in non-owner (attendee-b) visiting `/brackets/[id]` is **redirected to
  `/brackets/[id]/watch`** and sees the board with no result-entry affordance.
- **Cleanup is admin-only.** Standalone brackets expose no UI delete path (the
  workspace only offers share / watch links), so teardown hard-deletes via the
  new `deleteBracketById(id)` in
  [\_helpers/cleanup.ts](../../apps/web/tests/e2e/_helpers/cleanup.ts) —
  `event_brackets` CASCADEs to `bracket_teams` / seeds / matches (migration
  `20260821000000`). Opt-in via `E2E_CLEANUP_SUPABASE_*`; the fixture leaks
  otherwise, matching the event bracket spec. **The broad
  `sweepLeakedE2EFixtures()` does NOT yet reclaim leaked standalone brackets**
  (they have no `E2E `-prefixed name column to match on) — follow-up.
- **Verified:** `playwright --list` = **195 tests / 33 files** (was 190/31; both
  new tests collect); e2e tsc baseline unchanged at **20** (new files add 0 —
  the throwaway `tests/**` tsconfig with `incremental: false` shows zero new
  errors); prettier-clean. **Not verified:** a live run against
  `dev.pickupvb.com` (no creds here; the tests mutate + the spec depends on the
  three `20260821*` migrations being deployed to dev). Full rationale:
  [journal 2026-05-31-bundle-e2e-standalone-brackets](../journal/2026-05-31-bundle-e2e-standalone-brackets.md).

### 2026-05-30 — Phase 2: league schedule + record + forfeit (closes C2)

- **C2 — RESOLVED (UI coverage); live dev run pending.** New
  [league.authed.spec.ts](../../apps/web/tests/e2e/league.authed.spec.ts) (**3 tests**) +
  [\_helpers/league.ts](../../apps/web/tests/e2e/_helpers/league.ts)
  (`createLeagueFixture` / `deleteLeagueFixture` / `leagueFixtureAvailable`).
- **Leagues have no UI provisioning path — admin-client self-provision instead.**
  Unlike brackets (walk-in escape hatch + `/events/new` flow), the event-type chooser
  offers only Open Play / Tournament and `EventSignupArea` skips `type === 'league'`, so
  there is no UI to create a league or register a league team. The helper inserts the
  event (`type='league'`, host = the default per-worker attendee-a, wide/live window so
  the `LeagueSchedule.addMatch` in-window invariant is easy to satisfy) + one `roster`
  division + N rostered teams (captained by the host, so one account drives everything)
  through the **opt-in service-role client** shared with `cleanup.ts`. Mirrors the row
  recipe in `supabase/snippets/seed-tournament-fixture.sql`, but writes
  `event_team_entries` (the table the league loaders + `listRegisteredTeams` actually
  read), not the older `event_teams`.
- **The three tests:** (1) **schedule + record** — host adds a Week-1 match between the
  two teams, then records 25–10 via the per-row "Edit / record result" disclosure, which
  drives `recordResultFromForm` → the user-scoped, RLS-gated
  `record_league_match_result` RPC (host passes `is_event_host_for_division`); the score
  - `Final` status render on the row. (2) **authz (UI-level)** — attendee-b (neither
    host/co-host nor a captain; the host captains both teams) sees the schedule but **no
    add form, no result-entry disclosure, no score inputs** — the schedule renders result
    entry to hosts only. (3) **forfeit** — host **marks a team forfeited** in the
    host-tools "League teams" panel then **reinstates** it; the toggle is asserted via
    button counts (2 "Mark forfeited" ↔ 1 "Reinstate"), reopening the collapsed Host-tools
    `<details>` after each redirect.
- **Audit framing corrected.** C2 said "schedule gen, standings, forfeit," but the built
  surface has **no auto schedule-generation** (hosts add matches by hand — the
  forfeit-action comment confirms generation is a deferred follow-up) and **no league
  standings UI** (the only `standings` code is bracket-only). "Standings after a result"
  is therefore exercised as the recorded score + `Final` status on the schedule row.
- **Sanctioned infra gate, not a silent fixme.** Because leagues can't be created without
  service-role access, the spec `test.skip`s loudly (counted against the skip budget)
  when `E2E_CLEANUP_SUPABASE_*` / `TEST_USER_EMAIL` are unset, per the reliability
  contract's "sanctioned infra gate" exception.
- **Verified:** typed `.insert(...)` calls compile clean against the generated `Database`
  types (validates every required column / enum / the EWKT `geo` write); `playwright
--list` = **9 tests / 2 files** for the league spec (all 3 collect), skip-budget
  reporter clean; `pnpm typecheck` + `pnpm lint` unchanged (e2e is excluded from both;
  the throwaway `tests/**` tsc shows zero new real errors — only the pre-existing,
  config-artifact `process` warning shared by every helper); prettier-clean. **Not
  verified:** a live run against `dev.pickupvb.com` (no creds here; tests mutate via the
  admin client). Full rationale:
  [journal 2026-05-30-bundle-e2e-phase2-leagues](../journal/2026-05-30-bundle-e2e-phase2-leagues.md).

### 2026-05-30 — Phase 1: bracket result-advances-winner + read-only authz (closes C3)

- **C3 — RESOLVED (UI coverage); live dev run pending.** New
  [bracket.authed.spec.ts](../../apps/web/tests/e2e/bracket.authed.spec.ts)
  (**4 tests**) + [\_helpers/tournament.ts](../../apps/web/tests/e2e/_helpers/tournament.ts)
  (`createAdHocTournament` / `addWalkInTeam` / `createAndGenerateBracket` /
  `recordFirstPendingMatch` / `resetFirstCompletedMatch`).
- **Self-provisioning, single account.** The host-only walk-in escape hatch
  (`addAdHocTeamFromForm`) lets the default per-worker attendee-a register ≥ 2
  teams and run create → seed → generate → record → reset with no second actor
  and no Stripe. Each test owns its fixture and tears it down (`cancelEvent` +
  `deleteEventById`); the persistent `E2ETFR` seed stays read-only.
- **The four tests:** (1) **advancement** — record one semifinal of a 4-team
  single-elim → **exactly one team appears in two match cards** (winner-agnostic
  signal it advanced into the final); (2) **authorization** (UI-level) —
  attendee-b sees the board but no `Enter/Edit result` form and no score inputs;
  (3) **champion** — record all three matches → the bracket completes, the
  `🏆 Champion decided …` banner (tree-bracket.tsx, `role="status"`) shows, the
  header flips to "Final results", and no `Enter result` forms remain;
  (4) **reset** — record one semifinal, then **Clear** it → the match reverts to
  pending (2 playable semis again, 0 completed) and the advanced team is pulled
  back out of the final (no team in two cards), exercising the recursive
  `resetMatch` downstream-clear contract.
- **Gotcha encoded in the helper:** `CreateBracketHandler` creates the bracket
  with **zero seeds**; `bracket.generate()` throws "Need at least 2 seeded
  teams" until the host clicks **Save seeding**. The helper does Create → Save
  seeding → Generate (the save step is harmless even if seeds already existed).
- **Retired** three now-covered `tournament.authed.spec.ts` fixmes (advancement,
  reset-match, champion → pointer comments to the new spec); the
  division-winner fixme stays for Phase 3 (C4).
- **Verified:** e2e tsc **23 → 20** (new files add 0; retiring the three
  single-arg `test.fixme('string')` calls — each one of the pre-existing errors
  — took `tournament` 14 → 11); `playwright --list` = **190 tests / 31 files**
  (was 186/30); prettier-clean. **Not verified:** a live run against
  `dev.pickupvb.com` (no creds here) — maintainer to confirm green. Full
  rationale: [journal 2026-05-30-bundle-e2e-phase1-brackets](../journal/2026-05-30-bundle-e2e-phase1-brackets.md).

### 2026-05-30 — Phase 0 increment C: per-worker auth (closes #3 → Phase 0 done)

- **#3 (refresh-token race + shared storageState) — RESOLVED (structural).**
  New [\_helpers/fixtures.ts](../../apps/web/tests/e2e/_helpers/fixtures.ts)
  implements Playwright's worker-scoped "account per parallel worker" pattern:
  attendee-a signs in **independently** once per `parallelIndex` →
  `.playwright/.auth/worker-<i>.json`, and the test-scoped `storageState` option
  is overridden to use it. Independent sessions ⇒ independent refresh-token
  families ⇒ no cross-worker invalidation.
- **20 authed specs migrated** — `from '@playwright/test'` →
  `from './_helpers/fixtures'` (the fixture `export *`s the rest, so `expect` /
  `type Page` are unchanged). No other spec edits.
- **`workers` cap lifted** — remote-local `2` → `undefined`; CI kept at `1`
  **by choice** (avoid an unverified load change on shared dev data + dev
  Supabase `/token` rate limits), not because the race requires it.
- **Kept the `setup` projects + `user.json` + role files** — the fixture fixes
  the **primary** session only; direct `STORAGE_PATHS.*` contexts and secondary
  roles still load shared files (per-worker for those is a follow-up).
- **Verified:** e2e tsc unchanged at **23** (identical per-file; `fixtures.ts`
  clean), `playwright --list` = 186 tests / 30 files (all migrated specs
  collect), reporter fires. **Not verified:** the live parallel-load payoff —
  needs a `--workers=4+` run against `dev.pickupvb.com` (maintainer).
- Full rationale: [journal 2026-05-30-bundle-e2e-phase0-increment-c](../journal/2026-05-30-bundle-e2e-phase0-increment-c.md).

### 2026-05-30 — Phase 0 increment B: helpers, `withAuthContext`, skip-budget (closes #6, #8, C1)

- **#6 (`navigation.ts`) — RESOLVED.**
  [\_helpers/navigation.ts](../../apps/web/tests/e2e/_helpers/navigation.ts)
  now owns `findOwnedGroupUrl` / `findCaptainedTeamUrl` /
  `ensureSearchableDisplayName`; the copies in `groups`, `groups-manage`, and
  `teams` are deleted and import from it. `findOwnedGroupUrl` unified to the
  trailing-slash-stripping variant (idempotent for the `groups-manage` callers).
- **#8 (`browser.ts` / `withAuthContext`) — RESOLVED.**
  [\_helpers/browser.ts](../../apps/web/tests/e2e/_helpers/browser.ts) wraps
  `newContext → newPage → try/finally close`; adopted at the self-contained
  second-context blocks in `event-host` (`beforeAll`/`afterAll`/pro-sponsor/
  co-host name-fetch), `groups`, and `groups-manage`. The interleaved-context
  sites (`teams`, `player-social`, `event-host` broadcast) are intentionally
  left for the Phase 1+ rewrite — wrapping them would rewrite test control flow.
- **C1 (skip-budget guard) — RESOLVED (mechanism); threshold deferred.**
  [\_helpers/skip-budget-reporter.ts](../../apps/web/tests/e2e/_helpers/skip-budget-reporter.ts)
  is wired into [playwright.config.ts](../../apps/web/playwright.config.ts).
  Warn-only by default; fails the run when `skipped > E2E_SKIP_BUDGET`. Open
  decision #1 (the N, and fail-vs-warn in CI) preserved for the maintainer.
- **`isVisibleOrTimeout` no-op `timeout` — FIXED.** Now
  `waitFor({ state: 'visible', timeout })` instead of the ignored
  `isVisible({ timeout })`.
- **Verified:** e2e tsc baseline unchanged at **23**, identical per-file to
  stashed HEAD (tournament 14, groups-manage 6, auth-extended 2, player-social 1
  — increment A's "tournament 14" was correct; count with `incremental: false`,
  since the base config's `incremental: true` leaves a stale `.tsbuildinfo` that
  wobbles repeated counts). `playwright --list` = 186 tests / 30 files (reporter
  loads); prettier-clean. Throwaway `tsconfig.e2e.tmp.json` used and deleted.
  One self-inflicted reporter type error (`onEnd` return type, TS2416) was
  caught by this check and fixed before hand-off.
- **Still open in Phase 0:** #3 (per-worker storage state) only.
- Full rationale: [journal 2026-05-30-bundle-e2e-phase0-increment-b](../journal/2026-05-30-bundle-e2e-phase0-increment-b.md).

### 2026-05-30 — Phase 0 increment A: defensive-`catch` sweep (C7, partial)

- **`.catch(() => false)` visibility probes → `isVisibleOrTimeout`** across
  13 specs (`authorization`, `profile-edit`, `hero-image`, `admin`,
  `auth-extended.public`, `event-attendance`, `notifications`,
  `billing-stripe`, `player-social`, `groups`, `groups-manage`, `teams`,
  `event-host`). Suite-wide count **42 → 1** (the survivor is a
  response-promise coercion, not a probe).
- **`networkidle`: confirmed already done** — no real calls remain; the
  grep hits are explanatory comments. C7's "finish the sweep" is, for the
  code half, complete.
- **Verified:** e2e tsc baseline unchanged (23 pre-existing errors, zero
  added — confirmed by a throwaway `tests/**` tsconfig, since e2e specs are
  excluded from `pnpm typecheck`/`lint`); `playwright --list` parses all
  186 tests; prettier-clean. No app code or config touched.
- **Deferred** (still open under C7 / Phase 0): `browser.ts`
  `withAuthContext` (#8), `navigation.ts` (#6), skip-budget guard (C1), and
  fixing `isVisibleOrTimeout`'s no-op `timeout` arg.
- Full rationale: [journal 2026-05-30-bundle-e2e-phase0-increment-a](../journal/2026-05-30-bundle-e2e-phase0-increment-a.md).

### 2026-05-30 — helper layer landed; coverage pass added

- **P2 #4 (auth-setup factory) — RESOLVED.** `defineAuthSetup` /
  `skipIfMissingAuth` now live in
  [\_helpers/auth.ts](../../apps/web/tests/e2e/_helpers/auth.ts); the six
  `auth.*.setup.ts` files collapsed to a few lines each.
- **P2 #5 (`existsSync` skip boilerplate) — RESOLVED.** Replaced by
  `skipIfMissingAuth(STORAGE_PATHS.<role>, '<role>')`.
- **P2 #7 (storage-path math) — RESOLVED.** Central
  [\_helpers/paths.ts](../../apps/web/tests/e2e/_helpers/paths.ts)
  exports `STORAGE_PATHS`.
- **Proposed `events.ts` helper — RESOLVED** as
  [\_helpers/event-create.ts](../../apps/web/tests/e2e/_helpers/event-create.ts)
  (`createFreeOpenPlayEvent` / `createPaidEvent` / `cancelEvent` /
  `pickFutureDateTime`), plus [\_helpers/cleanup.ts](../../apps/web/tests/e2e/_helpers/cleanup.ts)
  (opt-in admin deletes) and [\_helpers/stripe.ts](../../apps/web/tests/e2e/_helpers/stripe.ts)
  (Checkout drivers) — neither was in the original layout.
- **P1 #2 (`.catch(() => false)`) — helper landed, adoption incomplete.**
  `isVisibleOrTimeout` exists in
  [\_helpers/predicates.ts](../../apps/web/tests/e2e/_helpers/predicates.ts);
  not yet swept across all specs → folded into **C7**.
- **P1 #1 (`networkidle`) — partially done.** ~5 occurrences remain →
  folded into **C7**.
- **Still open from 2026-05-25:** #3 (per-worker storage state), #6
  (`navigation.ts`), #8 (`browser.ts` / `withAuthContext`), #9
  (`event-host` SRP split), #11, #12.
- **Added this pass:** coverage findings **C1–C7** and the phased game
  plan above. No test code changed in this pass (plan/audit only).
