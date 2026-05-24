# Onboarding — day 1

A short, opinionated path from `git clone` to "I shipped a small PR."
Companion to the full setup docs — this page is the **reading
order** and the **shortest sensible path**, not a replacement for
the references it links into.

> **Audience:** a contributor (or future-you) joining the codebase
> for the first time. Goal: localhost running, one test passing, and
> a clear sense of where to look next.
>
> **Time:** ~45 minutes once the prerequisites are installed.

---

## TL;DR — the 15-minute path

```bash
# 1. Tools (one-time, skip if already installed)
brew install node@20 pnpm supabase/tap/supabase
corepack enable

# 2. Clone + install
git clone git@github.com:cooler09/pickupvb.com.git
cd pickupvb.com
pnpm install
cp .env.example .env   # fill in only what you need to touch — see below

# 3. Local Supabase
pnpm supabase:start    # Docker required; prints anon + service_role keys
pnpm db:migrate
pnpm --filter @pickupvb/supabase gen:types

# 4. Run
pnpm dev               # http://localhost:3000

# 5. Verify
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

If all five blocks ran clean, you're set up. If any failed, jump to
[Troubleshooting](#troubleshooting) at the bottom — the common
failure modes have known fixes.

---

## What to read, in order

You don't need to read everything before you can ship. Read these
three first, then skim the rest as needed.

### Read first (≈30 minutes total)

1. **[AGENTS.md](../AGENTS.md)** — the canonical conventions doc.
   Verify-quad, error model, page-composition rules, common pitfalls,
   and patterns surfaced by audits. **This is the single most
   important file to read.**
2. **[README.md](../README.md)** — stack, hexagonal architecture
   diagram, getting-started block, scripts. Skim the architecture
   section even if you already know Next.js — the
   domain/application/infrastructure/web split is enforced.
3. **[packages/domain/README.md](../packages/domain/README.md)** —
   how the domain layer is organized and how to extend an aggregate.
   Use it as the template for the other package READMEs.

### Read when you hit it

| Topic                                                             | Doc                                                                                                                                 |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Why hexagonal / Supabase Auth / typed errors / page decomposition | [docs/adr/](adr/) (small, dated, decision-focused)                                                                                  |
| Adding a new HTTP endpoint                                        | [docs/api-reference.md](api-reference.md)                                                                                           |
| Adding a domain rule + tests                                      | [docs/testing.md](testing.md), [packages/domain/README.md](../packages/domain/README.md)                                            |
| Writing a Supabase migration                                      | **Migrations** + **Migration preamble** in [AGENTS.md](../AGENTS.md), [packages/supabase/README.md](../packages/supabase/README.md) |
| Inspecting prod data safely                                       | [docs/database-operations.md](database-operations.md)                                                                               |
| Sentry, Analytics, cron alerts                                    | [docs/monitoring.md](monitoring.md)                                                                                                 |
| Deploy / rollback / migration recovery                            | [docs/runbook.md](runbook.md)                                                                                                       |
| Stripe checkout + webhooks                                        | [docs/stripe-webhooks.md](stripe-webhooks.md), [ADR 0011](adr/0011-stripe-webhook-dedupe.md)                                        |
| Who gets paid for an event (host vs. group)                       | [docs/payments.md](payments.md)                                                                                                     |
| Standing up a staging env                                         | [docs/setup-dev-environment.md](setup-dev-environment.md)                                                                           |
| Reset local fixtures                                              | [docs/reset-test-data.md](reset-test-data.md)                                                                                       |
| Integrations + env vars                                           | [docs/integrations.md](integrations.md), [.env.example](../.env.example)                                                            |
| What changed when, and why                                        | [docs/journal/](journal/)                                                                                                           |
| Open backlog (P1/P2/P3)                                           | [docs/audits/](audits/)                                                                                                             |

### Skim once, refer back

- **[apps/web/README.md](../apps/web/README.md)** — route-tree and
  library-landmarks for `src/app/` and `src/lib/`.
- **Per-package READMEs** under [packages/](../packages/) — one per
  layer; useful when a change crosses a boundary.

---

## Your first PR

Pick the smallest meaningful change. The verify quad is the gate.

1. **Branch off `develop`** (production deploys from `main`; `develop`
   is the integration branch).
2. **Make the change.** Match the surrounding style; don't drop in
   unrelated improvements (see AGENTS.md "Implementation discipline").
3. **Run the verify quad** from the repo root:

   ```bash
   pnpm typecheck && pnpm lint && pnpm test && pnpm build
   ```

   All four must pass. Turborepo caches, so re-runs are fast. The
   build catches things the editor doesn't (route type generation,
   `next/font` validation). The tests guard domain/application
   invariants.

4. **If you touched the domain or application layer**, add a Vitest
   case alongside the change. See
   [docs/testing.md](testing.md) for the layered approach.
5. **If you wrote a Supabase migration**, follow the preamble
   convention in [AGENTS.md](../AGENTS.md) → Migrations →
   **Migration preamble**, and regenerate types
   (`pnpm --filter @pickupvb/supabase gen:types`).
6. **Open a PR against `develop`.** The PR template's checklist
   mirrors the verify quad — fill it in honestly.

The agent will not commit or push on your behalf — that's the
contributor's job. AGENTS.md spells this out.

---

## Mental model in five bullets

- **Hexagonal.** Domain (pure TS) ◄ Application (pure TS) ◄
  Infrastructure (Supabase adapters) ◄ apps/web (Next.js). Inner
  layers never import outward; `domain` and `application` are
  framework-free.
- **Typed domain errors.** Throw `DomainError` subclasses
  (`NotFoundError`, `ConflictError`, `CapacityExceededError`, …),
  never `new Error('NOT_FOUND')`. The HTTP boundary in
  [apps/web/src/lib/api-helpers.ts](../apps/web/src/lib/api-helpers.ts)
  maps them to status codes.
- **Page composition.** Pages are thin orchestrators. Co-locate
  sub-components under `_components/` and server actions next to
  (not inside) pages. Target ≲ 200 LOC per page.
- **Anonymous auth is enabled.** A user may be signed in but have
  `is_anonymous: true` on their JWT — guard "real account required"
  actions on that claim, not just on `user != null`.
- **Server actions revalidate.** Every mutating server action ends
  with `revalidatePath(returnPath)` — pass `returnPath` through from
  the page. Stripe-redirecting actions are the documented exception
  (the webhook handles revalidation later).

---

## Troubleshooting

| Symptom                                                      | Fix                                                                                                                                                                                                                           |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm supabase:start` hangs or errors on Docker              | Confirm Docker Desktop is running. `supabase status` shows what's up. `supabase stop` then `pnpm supabase:start` cleans state.                                                                                                |
| `pnpm db:migrate` fails partway through                      | See [docs/runbook.md](runbook.md) → **Bad migration recovery**. Locally, easiest fix is `supabase db reset` (wipes local DB and re-applies all migrations + seed).                                                            |
| `pnpm typecheck` complains about missing Supabase types      | Regenerate: `pnpm --filter @pickupvb/supabase gen:types` against your local instance. The CLI must be linked (`supabase link --project-ref <local>` isn't needed for local — the CLI introspects the running local Postgres). |
| `pnpm build` fails on `next/font` or route types             | Catches drift the editor misses. Re-run after typecheck passes; look for the first failing route.                                                                                                                             |
| `exactOptionalPropertyTypes` errors on conditional JSX props | Use the spread pattern `{...(cond ? { prop } : {})}` instead of `prop={cond ? x : undefined}`. AGENTS.md → TypeScript covers this.                                                                                            |
| `'use server'` action 404s on submit                         | Plain `<form action={fn}>` delivers `FormData` — use the helpers in [apps/web/src/lib/form-data.ts](../apps/web/src/lib/form-data.ts), not raw `formData.get(...)`, and bind `returnPath` so revalidate can fire.             |
| Tests look fine locally but CI fails                         | CI runs the verify quad against a fresh install. Reproduce with `rm -rf node_modules && pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build`.                                                              |
| You touched a server action but the page doesn't refresh     | Missing `revalidatePath()`. See **Common pitfalls** in AGENTS.md.                                                                                                                                                             |

For everything else: search [docs/journal/](journal/) by symptom —
recurring issues get a dated entry explaining how they were fixed.

---

## Where to ask

Solo-maintained project for now. If you're contributing externally,
open an issue with the **Bug** or **Feature request** template at
[.github/ISSUE_TEMPLATE/](../.github/ISSUE_TEMPLATE/). For ops or
infrastructure questions that touch live data, follow the runbook
first — most "is this safe?" questions have a documented answer
already.
