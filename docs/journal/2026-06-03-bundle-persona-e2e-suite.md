# Persona-driven e2e suite + harness (2026-06-03)

## Context

User wants detailed personas tied to e2e scenarios, with dev accounts to be
provisioned over time. First [docs/personas.md](../personas.md) landed (the
cast: 18 named personas + org/team entities + provisioning matrix). This bundle
is the e2e half: a persona harness and one journey spec per persona, covering
the whole feature suite ([docs/features.md](../features.md)) at the breadth the
existing role-based suite ([apps/web/tests/e2e/](../../apps/web/tests/e2e/))
already established.

## Decisions

- **Skip-graceful over hard-wired**, because the dev accounts don't all exist
  yet. New personas have no storage state until their `TEST_*_EMAIL` is set;
  `skipIfPersonaMissing` / `withPersona` skip with a message naming the missing
  var. Same contract as the legacy `skipIfMissingAuth` — the suite lands green
  before provisioning and lights up incrementally. Chosen over gating the whole
  thing behind a feature flag (invisible coverage) or shipping it red.
- **One registry-driven setup project over one file per persona.** All 11 new
  sign-ins live in a single [auth.personas.setup.ts](../../apps/web/tests/e2e/auth.personas.setup.ts)
  loop registered as the one `setup-personas` project, vs. the legacy
  one-file-one-project pattern (which would mean 11 near-identical files + 11
  config projects). [\_helpers/personas.ts](../../apps/web/tests/e2e/_helpers/personas.ts)
  is the single registry both the setup and the specs read.
- **Six personas adopt the six pre-seeded accounts** (Amy→attendee-a,
  Adam→attendee-b, Julie→free-host, Mark→pro-host, Carlos→stripe-host,
  Zoe→admin) via `adoptsExistingSetup: true`, so we never sign the same account
  in twice. The registry reuses the existing `STORAGE_PATHS` entries for them.
- **Persona-centric journey specs over more feature-centric specs.** The ask
  was literally "tests based on these personas"; the existing suite is already
  feature-centric, so persona specs complement (don't duplicate) it. Where a
  flow is already covered as a single-actor journey (single-elim bracket,
  RSVP/leave, team invite), the persona spec defers to it with a pointer + a
  `test.fixme` rather than re-implementing — the NEW value is the
  relationship/authorization scenarios (co-host boundary, visibility scoping,
  Pro-downgrade boundaries, free-agent pickup, buyer money paths).
- **`test.fixme` for anything needing Stripe test-mode, email inbox, or seeded
  multi-actor relationships.** Matches the suite's documented-intent philosophy
  (the fixme body is the spec for the next agent). Runnable now: read-only
  reachability + skip-graceful single-actor flows (free-event create, team
  create + soft-delete, the Nina paid-event preflight block).

## Changes

- `_helpers/personas.ts` (new) — `PERSONAS` registry (key, id, role, env var,
  storage path, adopts-flag), `NEW_PERSONA_KEYS`, `skipIfPersonaMissing`,
  `withPersona` (wraps the existing `withAuthContext`).
- `_helpers/paths.ts` — 11 new persona storage-state paths.
- `auth.personas.setup.ts` (new) — registry-driven, skip-graceful sign-ins.
- `playwright.config.ts` — new `setup-personas` project + `authed` dependency.
- 16 `persona-*.spec.ts` (new, 89 tests) — one per persona; Greg is a
  `.public.spec.ts` (no account, runtime anon). Hosts: mark, julie, steve,
  sofia, diana, nina. Players: amy, adam, bianca, tyler, priya, marcus, hannah,
  olivia. Lifecycle/platform: rachel, zoe. Greg: anon.
- `apps/web/tests/e2e/README.md` — persona-accounts table (new env vars) +
  link to the provisioning matrix; the `globalTeardown` hygiene note.
- `docs/e2e-test-plan.md` — pointer to personas.md from § 0.

### Residue-cleanup follow-up (same day)

Reviewed exactly what the suite writes: only 4 runnable tests mutate — Mark /
Julie / Nina each create one free event (`E2E Persona … <ts>`, cleaned via UI
cancel + admin `deleteEventById`), Bianca creates one team (UI soft-delete +
admin `deleteTeamBySlug`). Everything else is read-only; no test creates a
_succeeding_ paid event, so the rolling-30d free-tier cap is never consumed.
Without `E2E_CLEANUP_SUPABASE_*` the UI cancel/soft-delete leaves a
`cancelled` event / `deleted_at` team that accumulates run over run. Two fixes:

- **`global-teardown.ts` + `globalTeardown` config** — runs
  `sweepLeakedE2EFixtures({ olderThanHours: 1 })` at end of every run. No-op
  without cleanup creds; the **1h age guard** keeps a concurrent run's < 1h
  fixtures safe (the reason the sweep was previously manual-only). Opt out with
  `E2E_NO_TEARDOWN_SWEEP=1`. `sweepLeakedE2EFixtures` gained an optional
  `{ olderThanHours }` that chains `.lt('created_at', cutoff)` onto each
  table's select.
- **Nina misprovision guard** — the paid-block test now checks
  `/profile/billing` for charges-enabled signals first and skips if Nina is
  (mis)provisioned with Stripe, because a published paid event consumes a
  free-tier cap slot that cancellation does **not** refund (abuse guard),
  which would silently change what the test proves on later runs.

## Patterns observed

- **`#hostGroupId` options are keyed by group UUID, not the vanity slug.**
  `findOwnedGroupUrl` returns a slug URL, so `selectOption(slug)` throws.
  Mark's "host under group" test reads the option `value`s off the live select
  (`evaluateAll`) and picks the first real one instead. Anyone wiring
  host-as-group in a test should pull the value from the DOM, not derive it
  from the group URL.
- **Public specs must import `test` from `@playwright/test`, not
  `_helpers/fixtures`** — the fixtures `test` is extended with a worker-auth
  fixture that signs attendee-a in, which a no-auth `.public.spec.ts` must not
  trigger. Greg's spec follows the existing public-spec convention.
- **e2e files are outside `tsc`/eslint** (apps/web `tsconfig.include` is
  `src/**`; eslint ignores `tests/**`). The standard quad won't catch test
  errors — smoke with `pnpm exec playwright test --list` (transpiles every
  spec; catches syntax / bad imports / missing exports). Noted so the next
  agent doesn't assume `pnpm typecheck` covers a new spec.

## Verify

- `pnpm exec playwright test --list` (from `apps/web`) → 294 tests in 51 files,
  all persona specs + the 11 `setup-personas` sign-ins enumerated, no transpile
  errors. The standard quad (`typecheck`/`lint`/`test`/`build`) is unaffected —
  every change is under `tests/`, `playwright.config.ts`, or `docs/`, none of
  which is in the typecheck/lint/build surface.
- **Not run against a live target** — the new persona accounts aren't
  provisioned yet, so the authed persona tests skip-graceful. Run the full
  suite against dev once the [provisioning matrix](../personas.md#provisioning-matrix)
  accounts + relationships exist (Node 22; export the `TEST_*` vars; see the
  e2e README gotchas).

## First live dev run (2026-06-03)

Ran the persona suite against dev once all 18 persona accounts + their groups/
teams were provisioned (via the new `apps/web/scripts/run-e2e.mjs`, which loads
`.env.local` robustly — `source` choked on a multi-line key — and maps the
cleanup creds). Result: **54 passed / 8 failed / 45 skipped**, then **0 failed**
on the relevant specs after fixes. Highlights:

- **All 17 account sign-ins passed** — provisioning + the appended persona
  `TEST_*_EMAIL` vars are correct.
- **`globalTeardown` reclaimed 488 historical leaked fixtures** (>1h old: 448
  events, 21 groups, 19 teams) and left the persona seed (plain-named) intact —
  the age guard + naming rule both held in practice.
- **Real product finding:** the **league create flow has shipped** —
  `/events/new` now offers a League type (`new-event-form.tsx` EventType.League;
  `actions.ts` `isLeague` create path with per-division pricing). Diana's test
  caught that the "leagues have no UI create path" assumption (this journal's
  earlier note, the league-spec comment, `_helpers/league.ts`'s admin-fixture
  rationale, and the e2e memory) is now **stale**. Updated Diana's test to assert
  all three types are offered; the league fixmes can now be graduated to drive
  the real create flow.
- **Three test-quality bugs fixed** (mine): Amy asserted `res.ok()` on
  `/notifications`, which isn't a routed page (the bell is a header popover) →
  assert the header bell instead; Zoe targeted `/admin/claims` (404; only
  `/admin/community-import` exists) and `locator('main')` tripped strict mode on
  the 404's `<main>` → real route + `.first()`; Diana (above).
- **Pre-existing shared-helper issue (not persona-specific):** 4 event-creation
  tests (Mark/Julie/Nina) fail in `pickFutureDateTime` —
  "DateTimePicker for endsAt did not populate hidden input." Same helper
  `event-host.authed.spec.ts` uses, so it's suite-wide; recent date/timezone
  commits are the likely cause. Needs a trace to fix — left as a follow-up.

## Follow-ups

- Provision the 11 new dev accounts + the seed state each persona assumes
  (group/team membership, co-host rows, friend edges) per the provisioning
  matrix, then graduate the read-only/skip-graceful tests by running them green.
- Graduate the `test.fixme` entries as their blockers clear: Stripe test-mode
  fixture suite (Mark/Julie/Carlos/Marcus/Rachel paid + tip + refund + Pro
  lifecycle), positional open-play fixture (Priya), seeded scoped events +
  friend edges (Olivia visibility), capacity-1 event (Hannah waitlist),
  free-agent pool + captain pickup (Tyler/Bianca).
- Consider re-homing the league fixture (`_helpers/league.ts`, currently
  attendee-a-keyed) onto a host-email param so Diana's league journeys can run
  as Diana rather than staying fixme.
