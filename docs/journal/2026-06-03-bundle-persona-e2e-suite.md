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
  link to the provisioning matrix.
- `docs/e2e-test-plan.md` — pointer to personas.md from § 0.

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
