# Running the persona e2es: three real product bugs surfaced (2026-06-04)

## Context

Follow-up to [2026-06-04-bundle-persona-e2e-fixmes.md](2026-06-04-bundle-persona-e2e-fixmes.md),
which **authored** the persona workflows but explicitly did not run them
("a written e2e ≠ a run e2e"). User asked to run the suite against
`dev.pickupvb.com` and fix anything broken — stale tests _or_ real product
bugs. Two passes:

1. **Whole-suite sweep** (`run-e2e.mjs`) — started at **35 failed**. The bulk
   was test-drift against shipped UI changes; one was a real backend bug.
2. **Persona sweep** (`run-e2e.mjs persona-`) — **2 failed / 68 passed / 36
   skipped**. Both failures were **real product bugs**, not stale tests.

The newly-un-skipped tests (the `endsAt` helper fix below let a batch of
previously-`beforeAll`-failing specs actually run) surfaced more drift _and_
the two persona bugs. This entry records the three real product bugs; the
test-drift fixes are mechanical and listed under Changes.

## The three real product bugs

### 1. Standalone bracket create/seed/generate/record all 500 (P1)

`save_bracket()`'s header write (the 20260908000000 rewrite) is
`insert … on conflict (id) do update`. Postgres evaluates the
`event_brackets_scope_xor` CHECK on the **proposed insert tuple** _before_ the
arbiter routes to DO UPDATE — and for a standalone bracket that tuple is
`owner_user_id = NULL` + `division_id = NULL` → XOR violation → the whole save
aborts. The repo pre-upserts the owner-scoped header, but `save_bracket` still
forms the bad tuple. **Every** standalone bracket operation was broken;
event-scoped brackets (non-NULL `division_id`) were fine. Reproduced directly
against dev. Fix: migration
[20260912000000](../../supabase/migrations/20260912000000_fix_save_bracket_standalone_scope_xor.sql)
rewrites the header step as `update … ; if not found then insert` so no
NULL-owner tuple is ever CHECK-evaluated. Logged in
[tournament-tools-workflow.md](../audits/tournament-tools-workflow.md). Deploy-gated.

### 2. Double elimination silently degenerates into single elimination (P1)

`Bracket.applyAdvancement` placed only the **winner** into its next match — it
ignored `loserAdvancesToMatchId`/`loserAdvancesToSlot`, which the generator
_does_ wire ([generators.ts](../../packages/domain/src/brackets/generators.ts)
:369/:382). So the losers bracket + grand final never received teams and stayed
unplayable: a 4-team double-elim played only the 3 winners-bracket matches.
`unwireAdvancement` had the mirror gap (it never pulled a dropped loser back out
on reset/re-record). Caught by `persona-sofia-tournament` (records all playable
matches, asserts > 3 for a 4-team DE). Fix in
[bracket.ts](../../packages/domain/src/brackets/bracket.ts): drop the loser into
its LB slot; unwind cascades both edges (keyed `matchId:slot`). Single-elim /
pool-play unaffected (their loser edges are NULL). Two domain tests added.
Logged in [tournament-tools-workflow.md](../audits/tournament-tools-workflow.md).

### 3. Scoped events leak to any viewer (P1 — privacy)

A `friends_of_host` event was loadable by a non-friend. The event-detail read
runs on the **service-role admin client** (`SupabaseEventRepository.getDetail`,
the no-arg module-singleton `eventRepo`) — RLS-bypassed for caching/perf — and
performs **no visibility check**. The `viewerId` it carries drives the friend
graph / RSVP bits, not access (the doc comment claimed it gated visibility; it
never did). Anon viewers leaked the same way via `loadEventReadModelPublic` +
`generateMetadata`. Caught by `persona-olivia-social`. Fix in
[load-event-detail.ts](../../apps/web/src/app/events/[id]/_loaders/load-event-detail.ts):
logged-in viewers get a cheap user-scoped existence check against the
RLS-protected base `events` table (delegate to the canonical `events_select`
policy — invite_only stays link-readable); anon viewers get a static
`published && (public|invite_only)` gate; `generateMetadata` gated the same way.
Logged in [security.md](../audits/security.md) as a new instance of the
admin-client-bypass class. Deploy-gated.

## Decisions

- **Delegate visibility to RLS rather than re-deriving it.** The `events_select`
  policy is the single source of truth (host / co-host / friend / group /
  public / invite_only-by-link / friends_of_attendees). A user-scoped existence
  check on the base table reuses it exactly — chose that over re-implementing
  the 4-visibility-type rules in app code (which would drift from RLS and risk
  over- or under-blocking). Anon visibility is static (no friend edges), so the
  cacheable public path is gated by the event's own fields, keeping it cacheable.
- **Fix `save_bracket` with UPDATE-then-INSERT, not by changing the constraint
  or the RPC signature.** The XOR invariant is correct; only the header write's
  ON CONFLICT ordering was wrong. UPDATE-first never forms the bad tuple and
  keeps steps 2–4 + the signature byte-identical.
- **Fixed the helper, not the feature, for the `endsAt` flake.** The form
  auto-fills `endsAt = startsAt + 2h`; the old "click the last enabled day"
  logic collided with that auto-selection (single-mode toggle-deselect). Product
  behavior is correct — rewrote `pickFutureDateTime` to advance a month + pick
  distinct days.
- **Left the Stripe-Checkout paid-flow cluster (4 `event-attendance` tests)
  flagged, not patched.** They hang inside the Stripe-hosted Checkout page
  driving — a known-brittle external surface, separate from the persona work.

## Changes

Domain / app — the real-bug fixes #2 + #3:

- `packages/domain/src/brackets/bracket.ts` — `applyAdvancement` drops the
  loser; `unwireAdvancement` cascades both edges.
- `packages/domain/src/brackets/bracket.test.ts` — 2 double-elim tests.
- `apps/web/src/app/events/[id]/_loaders/load-event-detail.ts` — visibility gate.
- `apps/web/src/app/events/[id]/page.tsx` — `generateMetadata` visibility gate.

Already committed (`03ab610f`/`b79344a6`, deploying) — bug #1 + the test-drift:

- `supabase/migrations/20260912000000_*` — `save_bracket` XOR fix.
- `_helpers/event-create.ts` — `pickFutureDateTime` next-month/distinct-day;
  `cancelEvent` → `/manage` (the danger zone moved off `/edit`); `openTemplatesModal`.
- `_helpers/tournament.ts` — `addWalkInTeam`→`addWalkInTeams` ("+ Add teams" +
  unified multi-add `WalkInTeamForm`); `createBracketToDraft` format param.
- `_helpers/league.ts` — drop `teams.format` (column removed); `hostEmail` re-home.
- Spec updates: templates-modal (5), league forfeit → `/manage`, events-browse
  filter `<details>`, refund-window default (drop Pro-gated 168h), removed the
  stale profile hero-upload test, standalone-bracket serial + cap fast-fail.

## Patterns observed

- **Admin-client reads need an explicit app-layer visibility/authorization gate
  — RLS won't save you.** This is the read-side twin of AGENTS.md pitfall #8
  (admin-client _writes_ bypass RLS). `getDetail` (read) and the division/co-host
  writes (security.md P1 #12) are the same class: the module-singleton repo
  lazily builds a service-role client, so any policy it "delegates to" never
  fires. When a singleton repo serves a viewer-facing read of a access-controlled
  row, gate it.
- **A wired-but-unapplied advancement edge is invisible to typecheck and to
  format-agnostic tests.** The generator set `loserAdvancesTo*` and the column
  persisted it, but nothing _applied_ it, and no test recorded a double-elim
  through. Multi-round formats need a record-through test, not just a generate
  test.

## Follow-ups

- **`getBracketMeta` spectator pages still leak scoped event metadata** (bracket
  / schedule / watch read via the same admin client with no gate). Not fixed —
  those are intended-shareable spectator surfaces and tournaments are usually
  public. Gate them the same way if scoped tournaments become common.
  ([security.md](../audits/security.md).)
- **Deploy-gated e2e verification.** Sofia (double-elim) + Olivia (visibility) +
  the standalone-bracket specs only go green once #1–#3 deploy to dev; the domain
  fix is unit-verified now, the visibility fix delegates to existing RLS.
- **Stripe-Checkout paid-flow cluster** (4 `event-attendance` tests) — fragile
  Stripe-hosted-page driving; needs a separate hardening pass.
