# Contributing

Thanks for the interest. This is a **personal project** — I (Zachary) run
it, ship it, and pay for the Supabase and Vercel bills. Contributions are
welcome but ad-hoc: there's no SLA on review, no roadmap promises, and the
direction stays mine.

If that works for you, this doc covers the mechanics. The architectural
conventions live in **[AGENTS.md](AGENTS.md)** — read that first; it's
the single source of truth for code style, the error model, the
hexagonal layering rules, and the page-decomposition pattern.

## Code of Conduct

Participation in this project is governed by
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) (Contributor Covenant 2.1).
Be decent. Report abusive behavior via a GitHub private security
advisory on the repo — that's the only private channel currently
available and it works fine for conduct reports.

## Before you start work

- **Open an issue first for anything non-trivial.** A bug report or a
  one-line typo fix is fine to PR directly. A new feature, a refactor,
  a dependency bump, or anything that touches the domain layer should
  start as an issue so we can agree on the shape before you spend time.
- **Check [docs/audits/](docs/audits/) and [docs/journal/](docs/journal/).**
  The audits track open P1/P2/P3 findings with concrete recommended
  fixes; the journal explains why recent change-bundles were shipped.
  If your idea is already on the deferred list, link to it. If a
  recent journal entry contradicts what you're proposing, that's worth
  flagging in the issue.
- **Don't expect the secrets to work locally.** The `.env.example` is
  accurate, but the project uses a hosted Supabase + Stripe + Vercel
  environment that I won't share access to. You can run a local
  Supabase via `supabase start` (see [README.md](README.md#getting-started))
  for most domain work.

## Setup

See [README.md](README.md) for the full local-setup walkthrough. The
short version:

```bash
nvm use                     # Node 20
pnpm install
cp .env.example .env.local  # fill in the variables you need
supabase start              # local Postgres + Realtime + Auth
pnpm db:migrate             # apply migrations
pnpm dev                    # apps/web on :3000
```

## Conventions

All in [AGENTS.md](AGENTS.md). The ones that trip people up most:

- **Hexagonal layering is strict.** `packages/domain` and
  `packages/application` must stay framework-free — no Next, no Supabase.
- **Throw typed `DomainError` subclasses**, never bare `Error('NOT_FOUND')`.
  The HTTP boundary in
  [apps/web/src/lib/api-helpers.ts](apps/web/src/lib/api-helpers.ts)
  maps the typed errors to status codes; ad-hoc mapping in route
  handlers will be requested back.
- **`exactOptionalPropertyTypes: true`.** Conditional optional props
  spread, not `prop={cond ? x : undefined}`.
- **Co-locate route sub-components under `_components/`** and server
  actions next to (not inside) the page.

If a convention isn't in AGENTS.md and you had to figure it out from
existing code, that's a documentation gap — flag it in your PR.

## Verify before pushing

Run all four. The build catches things the editor doesn't (route type
generation, `next/font` validation), and the tests guard the
domain/application invariants:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Turborepo caches, so re-runs are fast. Don't ship a PR until all four
pass on a clean checkout of your branch.

## Pull requests

- **Branch naming:** anything descriptive (`fix/event-rsvp-double-submit`,
  `feat/division-picker`). No enforced prefix.
- **Commit messages:** the history uses lowercase imperative subject
  lines (`fix double-submit on rsvp form`); copy the surrounding style.
  Squash-and-merge is the default — your branch commits don't need to
  be beautiful, but the squashed commit message should be.
- **PR description:** what changed, why, and what you tested. If it
  closes an audit finding, link to the file and line range in
  `docs/audits/`. If it warrants a journal entry, add one under
  [docs/journal/](docs/journal/) following
  [docs/journal/README.md](docs/journal/README.md).
- **No `--no-verify`, no force-pushes to shared branches, no
  amending published commits.** Same rules the AI agents follow per
  AGENTS.md.

## Migrations

Schema changes go through `supabase/migrations/`. Never edit an applied
migration — add a follow-up. Every new migration starts with the
SQL-comment preamble described in
[AGENTS.md "Migration preamble"](AGENTS.md). Regenerate types after
applying:

```bash
supabase migration new <name>
pnpm db:migrate
pnpm --filter @pickupvb/supabase gen:types
```

CI applies production migrations automatically on deploy — don't run
them by hand.

## What you probably can't get merged

- **Framework changes in `domain` / `application`.** These two packages
  are deliberately framework-free; any PR that imports Next, React, or
  Supabase into them will be requested back.
- **`force-dynamic` on public pages without a documented reason.** See
  AGENTS.md "Patterns surfaced by audits" #3.
- **String error codes thrown as `Error`.** Use the typed `DomainError`
  hierarchy. See AGENTS.md "Patterns surfaced by audits" #2.
- **Large drive-by refactors.** Match the surrounding style; don't drop
  in unrelated improvements.

## Reporting security issues

Open a private security advisory on the GitHub repo (Security →
Advisories → New draft). Don't open a public issue. I'll respond when
I see it; I make no guarantees about response time but I do take it
seriously.

## License

[MIT](LICENSE). By contributing you agree your contributions are
licensed under the same terms.
