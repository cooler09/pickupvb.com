# E2E: standalone bracket coverage (ADR 0025) (2026-05-31)

## Context

ADR 0025 shipped **standalone (event-free) brackets** — an owner can run a
tournament bracket with no event, division, venue, dates, or ticketing. The
[standalone-brackets journal](2026-05-30-standalone-brackets.md) closed with an
explicit deferral:

> **No e2e yet.** A Playwright spec (create → add teams → seed → generate →
> record → open watch link) should be added and run green against dev.

This bundle implements that spec. It also extends the e2e coverage roadmap in
[docs/audits/e2e-tests.md](../audits/e2e-tests.md): standalone brackets postdate
that audit's snapshot, so there was no row for them — now there is, plus a
remediation-log entry.

## Decisions

- **Self-provision through the real UI, not the admin client.** Leagues (C2)
  needed an admin-client fixture because they have no UI create/registration
  path. Standalone brackets do (`/brackets/new`), so the spec drives the whole
  create→add→seed→generate→record→watch pipeline through the UI as one signed-in
  real user (the default per-worker attendee-a). Matches the reliability
  contract's "self-provision; a missing fixture is a hard fail, not a skip."
- **Reuse the event board ops; don't fork them.** `BoardView` / `MatchCard` are
  scope-agnostic (the standalone page passes `scope={kind:'standalone'}`), so
  `recordFirstPendingMatch` from `_helpers/tournament.ts` drives the standalone
  board verbatim. Only the create / add-teams / seed-generate steps needed a new
  helper (`_helpers/standalone-bracket.ts`) because those screens differ.
- **Target the add-teams input by role, not `name`.** The standalone add-teams
  modal renders `WalkInTeamForm` with `showRoster={false}`; the team-name field
  is a **controlled input with no `name` attribute** (it posts via a
  client-invoked action, not a `<form>`). So the helper scopes to the Radix
  `role="dialog"` and grabs its sole `getByRole('textbox')` rather than the
  `input[name="team_name"]` selector the event walk-in helper uses. The modal
  also **stays open across adds** (revalidates the workspace behind it), so the
  helper adds every team in one session and confirms each via the modal's
  "✓ Added this session (n)" tally.
- **Two tests, not four.** The event bracket spec already covers champion +
  reset on the same shared board components; duplicating them for standalone
  adds churn, not signal. The standalone-unique surface is (1) the UI pipeline +
  the public spectator watch link, and (2) the owner-only workspace redirect —
  so those are the two tests.
- **Cleanup via a new `deleteBracketById`.** Standalone brackets have no UI
  delete path, so teardown must use the admin client. `event_brackets` CASCADEs
  to `bracket_teams` / seeds / matches (migration `20260821000000`), so a single
  delete reclaims the fixture.

## Changes

- **`apps/web/tests/e2e/standalone-bracket.authed.spec.ts`** (new) — 2 tests:
  full pipeline + spectator watch link is live/read-only; non-owner is
  redirected to the read-only watch view.
- **`apps/web/tests/e2e/_helpers/standalone-bracket.ts`** (new) —
  `createStandaloneBracket` (drives `/brackets/new`, best-of-1),
  `addStandaloneTeams` (the typed-in-teams modal), `seedAndGenerateStandaloneBracket`
  (Save seeding → Generate, mirroring the event helper's zero-seeds gotcha).
- **`apps/web/tests/e2e/_helpers/cleanup.ts`** — added `deleteBracketById(id)`.
- **`docs/audits/e2e-tests.md`** — coverage snapshot row + remediation-log entry.
- **`docs/audits/README.md`** — index date + status note.

## Patterns observed

- **Scope-agnostic components pay off in tests too.** ADR 0025 generalized the
  bracket views with an additive `scope?` prop so event call sites stayed
  byte-compatible; the same property let the e2e reuse the event board helpers
  with zero changes. When a feature is built as "same component, new scope," the
  test helper split should follow the same seam — reuse the shared-surface ops,
  write new helpers only for the screens that genuinely differ.
- **A controlled, redirect-free modal form needs a different settle signal.**
  The event walk-in helper waits on a post-redirect "<n> registered team" header
  re-render; the standalone modal never redirects (it revalidates behind an
  open dialog), so the helper settles on the in-modal "Added this session (n)"
  tally per add, then on the workspace header count after "Done".

## Follow-ups

- **Live dev run.** Not run here (no creds; the tests mutate, and the spec needs
  the three `20260821*` standalone-bracket migrations deployed to dev). Run
  `standalone-bracket.authed.spec.ts` against `dev.pickupvb.com` under Node 22
  before calling it green — same operational gates as the other authed specs.
- **Sweep can't reclaim leaked standalone brackets.** `sweepLeakedE2EFixtures()`
  matches the `E2E `-prefixed name convention, but `event_brackets` has no name
  column — leaked standalone brackets (when `E2E_CLEANUP_SUPABASE_*` is unset)
  aren't reclaimed by the broad sweep, only by the per-test `deleteBracketById`.
  A name/owner-scoped sweep branch would close this. Tracked in
  [e2e-tests.md](../audits/e2e-tests.md).
- **Live-scoring (Pro-gated) is untouched.** The watch view's live-score overlay
  only renders when the bracket owner is Pro; attendee-a isn't, so the spec
  exercises the read-only board, not the realtime scoreboard. Covering live
  scoring belongs with the Phase 4 (payments/Pro) Stripe-fixture work.
