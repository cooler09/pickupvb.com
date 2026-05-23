# Testing strategy

> **Audience:** developers writing or reviewing code in this monorepo.
> **Scope:** what we test, where, with what tooling, and what the floor
> expectation is for new code. For ad-hoc test-data reset see
> [reset-test-data.md](reset-test-data.md).

## Current state (2026-05-22)

Three layers of automated tests run today:

| Layer            | Tool                  | Where                                                                  | Runs in CI?                           |
| ---------------- | --------------------- | ---------------------------------------------------------------------- | ------------------------------------- |
| Unit (domain)    | Vitest                | [packages/domain/src/\*_/_.test.ts](../packages/domain/src/)           | ✅ on every PR (`pnpm test:coverage`) |
| Unit (app layer) | Vitest                | [packages/application/src/\*_/_.test.ts](../packages/application/src/) | ✅ on every PR                        |
| Unit (web lib)   | Vitest (node env)     | [apps/web/src/lib/\*.test.ts](../apps/web/src/lib/)                    | ✅ on every PR                        |
| E2E              | Playwright (Chromium) | [apps/web/tests/e2e/](../apps/web/tests/e2e/)                          | 🟡 manual / scheduled (see below)     |

There is **no component-level test layer** (React Testing Library, Storybook
play-functions, etc.). Page-level behavior is exercised through E2E.

## What lives where

### Domain unit tests — `packages/domain`

Test aggregate invariants and value-object guards. Pure TypeScript; no
mocks, no I/O. **Every new aggregate or value object ships with a test
file in the same directory.**

Reference patterns:

- [packages/domain/src/events/volleyball-event.test.ts](../packages/domain/src/events/volleyball-event.test.ts)
  — state machine (`publish` / `cancel`), capacity enforcement, free-agent
  rules, payment-config invariants. Mirrors the aggregate file 1:1.
- [packages/domain/src/events/capacity.test.ts](../packages/domain/src/events/capacity.test.ts)
  — value-object construction + guards.
- [packages/domain/src/teams/team.test.ts](../packages/domain/src/teams/team.test.ts)
  — membership state machine.

**Assert on typed errors, not strings.** Every `expect().toThrow()` should
target a `DomainError` subclass:

```ts
expect(() => event.joinAsPlayer(userId)).toThrow(CapacityExceededError);
```

`packages/domain` must stay framework-free. No `vi.mock` of Next.js or
Supabase here — there's nothing to mock; the domain doesn't import them.

### Application unit tests — `packages/application`

Test command/query handlers against in-memory fakes of the domain ports.
The handler under test should be the only "real" code; repositories and
side-effect ports are hand-rolled fakes inside the test file.

Reference: [packages/application/src/commands/join-event.handler.test.ts](../packages/application/src/commands/join-event.handler.test.ts).

When a handler grows a new error path, add a test that exercises that
path. CQRS handlers are the natural place to enforce "this command throws
`ConflictError` when …" contracts.

### Web library unit tests — `apps/web/src/lib`

Pure helpers in `apps/web/src/lib/` that have non-trivial behavior get a
co-located `*.test.ts`. Today:

- [form-data.test.ts](../apps/web/src/lib/form-data.test.ts) — the
  `field()` / `bool()` / hard-max sanitization.
- [money.test.ts](../apps/web/src/lib/money.test.ts) — `parsePriceCents`,
  `parseRefundWindowHours`.
- [turnstile.test.ts](../apps/web/src/lib/turnstile.test.ts) — Cloudflare
  Turnstile verification, mocked with `vi.fn()` over `globalThis.fetch`.

**Do not** add Vitest tests for React components or pages in
`apps/web/src/app/`. Those are tested via Playwright; the unit suite uses
the `node` environment and pulling in React/JSDOM would slow CI for
little gain.

### E2E tests — `apps/web/tests/e2e`

Playwright with Chromium against a real running app (local dev server or
a Vercel preview/staging URL). Two projects defined in
[apps/web/playwright.config.ts](../apps/web/playwright.config.ts):

- **`public`** — no auth, runs anywhere. Currently:
  [smoke.public.spec.ts](../apps/web/tests/e2e/smoke.public.spec.ts).
- **`authed`** — depends on a one-time sign-in setup
  ([auth.setup.ts](../apps/web/tests/e2e/auth.setup.ts)) that uses
  `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` and stores session state for
  the rest of the run. Currently:
  [profile.authed.spec.ts](../apps/web/tests/e2e/profile.authed.spec.ts).

**E2E target environments:**

- **Local:** unset `PLAYWRIGHT_BASE_URL` → Playwright auto-starts
  `pnpm dev` on `http://localhost:3000`.
- **Vercel previews / staging:** set `PLAYWRIGHT_BASE_URL` to the
  preview URL and (if protected) `VERCEL_AUTOMATION_BYPASS_SECRET`.

**Never point E2E at production with authed tests** — the auth setup
signs in as `TEST_USER_EMAIL`, which must be a dedicated staging account.
The `smoke-prod.yml` workflow only runs the `public` project against
production.

## Running tests

| Goal                                      | Command                                                                          |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| All unit suites (cached by Turbo)         | `pnpm test`                                                                      |
| All unit suites with coverage (CI parity) | `pnpm test:coverage`                                                             |
| Just the domain layer                     | `pnpm --filter @pickupvb/domain test`                                            |
| Just the application layer                | `pnpm --filter @pickupvb/application test`                                       |
| Just web lib                              | `pnpm --filter @pickupvb/web test`                                               |
| One file, watch mode                      | `pnpm --filter @pickupvb/domain test path/to/file.test.ts --watch`               |
| E2E public smoke against local            | `pnpm --filter @pickupvb/web exec playwright test --project=public`              |
| E2E full suite against a preview          | `PLAYWRIGHT_BASE_URL=https://… pnpm --filter @pickupvb/web exec playwright test` |

The "verify quad" from [AGENTS.md](../AGENTS.md) runs the Vitest suites
but **not** Playwright:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Run Playwright locally before shipping a route-level change or anything
that touches the auth/redirect flow.

## CI workflows

- **[ci.yml](../.github/workflows/ci.yml)** — runs on every push to
  `main`/`develop` and every PR. Executes the verify quad (typecheck,
  lint, `test:coverage`, build) and uploads coverage artifacts. **Blocks
  merge if any of the four fail.**
- **[smoke-prod.yml](../.github/workflows/smoke-prod.yml)** — runs the
  Playwright `public` project against production after each push to
  `main`. Failure pings the runbook; it does **not** block deploys
  (Vercel ships first).
- **[e2e-develop.yml](../.github/workflows/e2e-develop.yml)** — runs the
  full Playwright suite (public + authed) against the staging
  environment on push to `develop`.
- **[e2e.yml](../.github/workflows/e2e.yml)** — `workflow_dispatch` for
  ad-hoc runs against any URL (PR previews, one-off debugging).

## Floor expectation for new code

When adding code, the bar is:

- **New aggregate or value object** → ship a `*.test.ts` next to it
  covering construction guards and at least one happy-path state
  transition. No PR review without it.
- **New command/query handler** → ship a handler test that uses
  in-memory fakes of the ports. Cover at least one error path with the
  appropriate typed `DomainError`.
- **New web-lib helper with branching logic** → ship a co-located test.
  Pure formatters and one-line wrappers can skip it.
- **New page or major route change** → consider adding a Playwright
  spec to the `public` or `authed` project. Required for anything in
  the registration/payment/auth flows.
- **New server action** → unit-testable through the handler it calls
  (see application-layer tests). The action wrapper itself is thin
  glue and doesn't need its own test.

## Patterns we don't use (and why)

- **React Testing Library / JSDOM component tests** — duplicates what
  Playwright already covers at the page level, and the unit suite stays
  fast by sticking to `environment: 'node'`. Revisit if we add a design
  system with non-trivial component logic.
- **Snapshot tests** — high noise, low signal. The domain test suite
  asserts on observable behavior (thrown errors, state transitions,
  computed properties), not internal representation.
- **Mocking Supabase in domain/application tests** — domain has no
  dependency on Supabase, and application tests use port fakes.
  Infrastructure adapters
  ([packages/infrastructure/src/](../packages/infrastructure/src/))
  currently rely on integration coverage via the E2E suite; if they
  grow non-trivial logic of their own, add Vitest with a real
  Supabase-local instance rather than mocking the client.

## See also

- [AGENTS.md](../AGENTS.md) — verify quad, repository shape.
- [packages/domain/README.md](../packages/domain/README.md) — aggregate
  cookbook (every entry includes "add a test").
- [docs/runbook.md](runbook.md) — what to do when CI or smoke-prod
  fails after deploy.
