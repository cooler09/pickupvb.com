# Persona e2e: graduating `test.fixme` stubs into runnable workflows (2026-06-04)

## Context

The persona e2e suite ([2026-06-03-bundle-persona-e2e-suite.md](2026-06-03-bundle-persona-e2e-suite.md))
shipped with ~30 `test.fixme` placeholders — documented intent for each
persona's deep workflow, left red because they needed fixtures, multiple
actors, or features that weren't wired yet. User asked to "implement more of
the fixmes… more workflows for the personas completed." Picked four bundles:
Diana (league season), Hannah (capacity/waitlist), Sofia (bracket formats),
Olivia + Zoe (visibility scoping + admin moderation). Authored + static-verified
only (typecheck/lint/test/build); **not** run against dev this pass (the user
opted to run them), so the specs mirror already-green patterns to de-risk the
"a written e2e ≠ a run e2e" gap.

## Decisions

- **Re-homed the proven league flows onto Diana rather than duplicating logic.**
  Generalized `createLeagueFixture` with an optional `hostEmail` (defaults to
  `TEST_USER_EMAIL`) so the same fixture that drives `league.authed.spec.ts` as
  attendee-a can host as Diana; the spec then drives the identical schedule /
  manage UI via `withPersona`. Chose this over a Diana-specific fixture because
  the league add-match/record and forfeit/reinstate flows are already green as
  attendee-a — only the actor changes.
- **Hannah's "auto-promote off the waitlist" is unbuilt — said so instead of
  faking a pass.** There is **no capacity waitlist queue and no auto-promotion**
  in `packages/domain`/`packages/application`: a full fixed-capacity join throws
  `CapacityExceededError` → the `?rsvp=full` flash. The only "waitlist" is the
  **position-roster over-fill** badge (Priya's domain). Implemented the honest,
  runnable workflow — the capacity boundary from the contender's seat (a
  capacity-1 event, attendee-a takes the spot, Hannah hits the full wall) — and
  left auto-promote/realtime `test.fixme` with notes recording that the feature
  doesn't exist. Rejected writing an auto-promote test (it would assert fictional
  behavior and ship red).
- **Parametrized the walk-in bracket helper by format** rather than cloning it
  per format. `createBracketToDraft` / `createAndGenerateBracket` take
  `{ format }`; assertions key off the board's format-specific structure
  (round-robin = n·(n−1)/2 simultaneously-playable matches; pool play = "Pool A/B"
  headings → "Generate playoff" CTA; double elim = "Winners/Losers bracket" +
  "Grand final"). Added `recordAllPlayableMatches` for the generator-defined
  multi-round walk-throughs where an exact fixed count isn't knowable up front.
- **Olivia's visibility scoping tested at the RLS boundary, not the feed.**
  `friends_of_host` discovery is gated by the `events` SELECT RLS on
  `friendships(user_id = host, friend_id = viewer)`. Provisioned that exact shape
  via a new admin-client fixture and asserted a friended persona loads
  `/events/[id]` (200) while an unrelated account gets `notFound()`. Chose the
  direct-URL RLS assertion over scraping the `/events` feed because it's the
  invariant that matters and doesn't depend on feed-query internals.
- **Zoe's hide/unhide is a persona-lens of `admin.authed.spec.ts`; claim +
  role stay fixme.** Hide/unhide got a runnable test backed by a shared
  community-listing helper. Claim approval needs a second actor who hosts a live
  event (the claim links a listing to the claimant's event) → kept fixme with
  that note. Role escalation has **no admin UI** (only `/admin/community-import`
  exists) → kept fixme; it's a DB/SQL op until a user-management page lands.

## Changes

- `_helpers/league.ts` — `createLeagueFixture`/`leagueFixtureAvailable` take an
  optional host email; dropped the private `resolveUserIdByEmail`.
- `_helpers/cleanup.ts` — exported shared `resolveUserIdByEmail` (used by the
  league + scoped-event fixtures).
- `_helpers/event-create.ts` — `createFreeOpenPlayEvent` gained `maxSpots`
  (Fixed-spots capacity, set before the dates) and `joinAsHost:false`.
- `_helpers/tournament.ts` — `WalkInBracketFormat` + `{ format }` on the bracket
  helpers; new `recordAllPlayableMatches`.
- `_helpers/scoped-event.ts` (new) — admin-provisioned `friends_of_host` event +
  host→friend `friendships` edge, with teardown that only deletes an edge it
  created.
- `_helpers/community.ts` (new) — `createThrowawayListing` / `delete…` +
  `adminHide/UnhideListing`.
- Persona specs filled in: `diana` (add-match/record, forfeit/reinstate),
  `hannah` (capacity-full boundary), `sofia` (round-robin, double-elim, pool
  play), `olivia` (follow/unfollow + self-invariant, friends_of_host scoping),
  `zoe` (hide/unhide).

## Patterns observed

- **The persona docs describe some aspirational behavior.** `docs/personas.md`
  bills Hannah as "lands on the waitlist, then auto-promoted when someone
  leaves" — but no such feature exists. When a persona's headline contradicts
  the domain, test what's built and record the gap; don't manufacture a green
  test. (Worth a memory so the next agent doesn't re-derive it.)
- **Admin-client fixtures share one resolver now.** `resolveUserIdByEmail` lives
  in `cleanup.ts`; both league and scoped-event fixtures import it. Future
  admin-provisioned fixtures should too rather than re-pasting the GoTrue paging.

## Follow-ups

- **Run the new specs against dev** (Node 22 + `TEST_*` + `E2E_CLEANUP_*`). They
  were authored against already-green patterns but not executed — the bracket
  Phase-1 precedent (specs shipped red) says run a mutating spec green before
  trusting it.
- **`friends_of_attendees` scoping** (Olivia) — extend `scoped-event.ts` with an
  `event_attendees` insert + attendee→viewer edge, mirroring
  `createFriendsOfHostEvent`. Left fixme.
- **Claim approval** (Zoe / `admin.authed.spec.ts`) — multi-actor; needs a
  claimant with a live event + the claim form's event picker.
- **Promote Hannah's auto-promote test** if/when a real capacity waitlist +
  promotion lands in `packages/domain`.

## Round 2 (same day) — Priya, Steve, Tyler + the backlog doc

Continued the graduation pass:

- **Priya** — RSVP into the libero slot + over-fill → "Waitlist" (the genuine
  waitlist in this app). New `_helpers/positional-event.ts` admin-provisions the
  `events.position_roster` jsonb. Gotcha: that column is in the DB (migration
  `20260514000600` ALTERs `public.events`) but **stale in the generated events
  Insert type** — the type carries `position_roster` only on `event_divisions`,
  so the fixture casts through a typed base (`{ ...base, position_roster } as
typeof base`). Worth a `gen:types` once a DB is reachable.
- **Steve** — co-host can reach the edit + manage pages (server `event.canManage`
  includes co-hosts); payouts route to the primary host so the event never shows
  in the co-host's earnings (Pattern 7). New `_helpers/co-hosted-event.ts`
  (`event_co_hosts` insert).
- **Tyler** — registers as a free agent in a division pool, reusing the league
  fixture (its roster division has `allow_free_agents` default true). The
  free-agent panel is reached via the `role="radio"` "Sign up solo" tab.

**Findings recorded as fixme (not test gaps — product changes):**

- **Co-hosts cannot broadcast.** `broadcasts_insert_event_host` RLS checks
  `events.host_id = auth.uid()` only — no `event_co_hosts` / host-group branch.
  So Steve's "co-host can send a host broadcast" can't pass until the policy
  (and the panel render gate) extends to co-hosts. Kept fixme with that note.
- **Olivia's scoping test paid for itself**: it surfaced a real event-detail
  visibility leak (scoped events readable by anyone because the detail read runs
  on the admin client with no gate) — fixed in `load-event-detail.ts` /
  `generateMetadata`. See the `event-detail-visibility-leak` memo.

**Documented the rest.** All 29 remaining persona `test.fixme`s are tabulated
with a blocker category + "to graduate" note in
[docs/audits/e2e-tests.md](../audits/e2e-tests.md) (2026-06-04 remediation-log
entry): Stripe-fixture (Marcus/Julie/Nina/Mark/Rachel), multi-actor roster
(Adam/Bianca/Tyler-pickup), feature-absent (Hannah auto-promote, Diana
playoff-from-standings, Zoe role-escalation), RLS-decision (Steve broadcast),
infra-hard (Greg/Turnstile, Hannah realtime), already-covered
(Adam-invite/Bianca-broadcast → `teams.authed.spec.ts`), and two
implementable-next (Olivia `friends_of_attendees`, Zoe claim-approval).
