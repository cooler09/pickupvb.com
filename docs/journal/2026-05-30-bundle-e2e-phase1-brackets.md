# Bundle: E2E Phase 1 — bracket result-advances-winner + read-only authz (C3)

First **deep-coverage** phase of the e2e coverage audit
([docs/audits/e2e-tests.md](../audits/e2e-tests.md)). Phase 0 built the
reliability foundation; this delivers the highest-risk gap it identified —
**brackets** — with four mutating tests against self-provisioned tournaments.

**Date:** 2026-05-30
**Scope:** Test-only — new `_helpers/tournament.ts`, new `bracket.authed.spec.ts`,
one retired fixme in `tournament.authed.spec.ts`. No app code.

## Context

C3 (P1): the bracket suite asserted only that the page renders; all six
mutations — including **record-result-advances-winner**, the headline risk —
were `test.fixme`. Match-result writes go through the captain-vs-host
`record_bracket_match_result` RPC (AGENTS pitfall #8) and winner advancement
touches a downstream match the caller may not own, so a silent regression here
is exactly the kind Phase 1 exists to catch.

## What changed

- **`_helpers/tournament.ts` (new)** — `createAdHocTournament` (drives
  `/events/new` → Tournament type → one ad-hoc division), `addWalkInTeam`
  (the host-only "Add a walk-in team" modal), `createAndGenerateBracket`
  (best-of-1 → create → **save seeding** → generate), `recordFirstPendingMatch`
  (records the first pending match, team A wins 25–10), `resetFirstCompletedMatch`
  (Edit result → Clear, settles on `notice=match_reset`).
- **`bracket.authed.spec.ts` (new, 4 tests)** — each self-provisions a disposable
  tournament as the default per-worker attendee-a and tears it down in `finally`:
  1. **Advancement (C3 headline):** 4 walk-in teams → 2 semifinals + a TBD final;
     record one semifinal; assert **exactly one team now appears in two match
     cards** (its semi + the final it advanced into) and the pending-match count
     drops 2 → 1.
  2. **Authorization (UI-level):** 2 walk-in teams → one final; attendee-b (via
     `withAuthContext`) sees the board but **no result-entry form and no score
     inputs**.
  3. **Champion:** 4 walk-in teams; record all three matches; assert the bracket
     resolves — `🏆 Champion decided …` banner (tree-bracket.tsx), header flips
     to "Final results", zero `Enter result` forms left, three completed.
  4. **Reset:** 4 walk-in teams; record one semifinal, then **Clear** it; assert
     it reverts to unplayed (2 playable semis, 0 completed) and the advanced team
     is pulled back out of the final (no team in two cards) — the recursive
     `resetMatch` downstream-clear contract.
- **`tournament.authed.spec.ts`** — retired three now-covered fixmes
  (advancement, reset-match, champion → pointer comments to the new spec); the
  division-winner fixme stays for Phase 3 (C4).

## Decisions & alternatives

- **Walk-in teams over a roster/seed clone.** C3's suggested fix was "self-
  provision a roster tournament + division + seeded bracket (a disposable
  clone)." The walk-in escape hatch (`addAdHocTeamFromForm`) is strictly
  simpler: one host account registers teams _directly into the division's
  bracket_, so the whole create → seed → generate → record → advance pipeline
  needs no second actor, no real `teams` rows, and no Stripe. The disposable
  ad-hoc tournament is created fresh per test and hard-deleted, so it never
  touches the persistent `E2ETFR` seed.
- **UI-level authorization, not an RPC probe** (maintainer's call). The result
  form is only rendered to host/captain, so asserting its **absence** for
  attendee-b is the honest UI contract. Forging a `record_bracket_match_result`
  POST as attendee-b would exercise the RPC gate end-to-end but depends on the
  Next server-action wire format (`Next-Action` header), which isn't a stable
  test surface. The RPC rejection stays owned by the DB `SECURITY DEFINER`
  policy and is better covered by a deterministic application-layer test.
- **Advancement assertion is winner-agnostic.** Rather than predict which seed
  wins (depends on `generateSingleElimination` internals), the test asserts the
  structural invariant: after one recorded semifinal, exactly one of the four
  teams appears in two cards. That holds regardless of bracket-generation order
  and reads as the advancement contract.
- **Best-of-1.** One set decides each match, so `recordFirstPendingMatch` only
  fills set 1 — with best-of-3 the match wouldn't complete on a single set and
  no winner would advance.
- **Each test fully self-provisions** (no shared `beforeAll`). Under
  `fullyParallel`, a shared mutable fixture would be fragile; the advancement
  test in particular needs a pristine bracket for its count assertions. The
  cost is ~2× provisioning time, acceptable for two slow tournament tests.

## Gotcha surfaced

- **Create does not seed.** `CreateBracketHandler` produces a bracket in `setup`
  with **zero** seeds; `bracket.generate()` throws `"Need at least 2 seeded
teams"` until the host persists the seeding order. The SetupView enables
  "Generate bracket" anyway (it counts _registered_ teams, not _seeded_ ones),
  so a naive Create → Generate flow errors. The helper does Create → **Save
  seeding** → Generate; the save step is harmless even where seeds already
  exist, so it's unconditional.

## Verification

- **e2e tsc 23 → 20** (deterministic throwaway tsconfig with
  `incremental: false`). The two new files (`tournament.ts` +
  `bracket.authed.spec.ts`) add **zero** errors; the count _dropped_ by three
  because retiring the advancement / reset-match / champion fixmes removed three
  single-arg `test.fixme('string')` calls — each one of the pre-existing 23
  errors — so `tournament.authed.spec.ts` went 14 → 11. Net: three fewer
  pre-existing errors, none added.
- **`playwright --list`: 190 tests / 31 files** (was 186 / 30) — all four new
  tests collect; the skip-budget reporter still loads.
- **prettier-clean.**
- **NOT verified here:** a live run against `dev.pickupvb.com`. No creds/dev
  server in this environment, and these tests mutate (create events, hit the
  geocoder, drive Stripe-free tournament flows) so they can't run offline. The
  selectors are derived from the component source, but a green run on dev is the
  maintainer's confirmation step — most likely failure modes are selector drift
  on `/events/new` (the Tournament type card, the division label input) or the
  walk-in modal.

## Follow-ups

- **Run `bracket.authed.spec.ts` against dev** to confirm green; fix any
  selector drift surfaced.
- **Application-layer test for the `record_bracket_match_result` RPC gate** —
  the deterministic home for the captain-vs-host rejection that the UI test only
  covers by absence-of-affordance.
- **Phase 2 (leagues, C2)** is next: `league.authed.spec.ts` — schedule gen,
  standings after a result, forfeit; mirror the bracket authz assertion for the
  league RPC.
- Remaining bracket fixme: division-winner (Phase 3, C4) — the tournament helper
  here is the starting point.

## Cross-references

- Audit: [docs/audits/e2e-tests.md](../audits/e2e-tests.md) — C3 + the Phase 1
  game-plan row + remediation log.
- Prior: [Phase 0 increment C](2026-05-30-bundle-e2e-phase0-increment-c.md).
