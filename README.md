# PickupVB

Find, host, and manage volleyball events — indoor, grass, and beach. Open play
and tournaments. Real-time spot updates. Host tools (brackets, seeding, scoring).

> **Working on this repo with an AI assistant?** Start with [AGENTS.md](AGENTS.md)
> for conventions, then [docs/adr/](docs/adr/) for the "why" behind the
> architecture and [packages/domain/README.md](packages/domain/README.md) for
> the domain layer.

## Stack

| Layer    | Tech                                                                   |
| -------- | ---------------------------------------------------------------------- |
| Monorepo | pnpm workspaces + Turborepo                                            |
| Frontend | Next.js 16 (App Router) + React 19 + Tailwind                          |
| API      | Next.js Route Handlers (`app/api/*`) calling pure CQRS handlers        |
| Domain   | Hand-rolled DDD/CQRS in `packages/{domain,application,infrastructure}` |
| Database | Supabase (Postgres 15 + PostGIS + Realtime)                            |
| Auth     | Supabase Auth (email/password + OAuth)                                 |
| Hosting  | Vercel (web + API) + Supabase (DB)                                     |
| CI/CD    | GitHub Actions + Vercel auto-deploy on push                            |

## Architecture

```
.
├── apps/
│   └── web/                       # Next.js – pages + API Route Handlers (app/api/*)
├── packages/
│   ├── domain/                    # Aggregates, value objects, repository ports (pure)
│   ├── application/               # CQRS commands/queries + handlers (pure, no framework)
│   ├── infrastructure/            # Adapters implementing domain ports (Supabase, etc.)
│   ├── types/                     # Shared DTOs & Zod schemas
│   ├── supabase/                  # Typed browser/server/admin clients
│   └── config/                    # Tailwind preset + tsconfig presets
└── supabase/
    ├── config.toml
    └── migrations/
```

### Hexagonal / DDD flow

```
HTTP request
   → app/api/events/route.ts        (validate w/ Zod, auth via Supabase SSR)
   → @pickupvb/application handler  (CreateEventHandler.execute(...))
   → @pickupvb/domain aggregate     (VolleyballEvent.create – enforces invariants)
   → @pickupvb/infrastructure repo  (SupabaseEventRepository.save)
```

Domain logic (invariants like _"indoor events can only be 6s or quads"_) lives
in [`packages/domain`](packages/domain) and is reused by the Route Handlers and
the web form validators (single source of truth).

## Getting started

### Prerequisites

- Node 20+ (`nvm use`)
- pnpm 9 (`corepack enable`)
- Supabase CLI: `brew install supabase/tap/supabase`
- Docker (for local Supabase)

### Install

```bash
pnpm install
cp .env.example .env
```

### Start Supabase (local)

```bash
pnpm supabase:start            # boots Postgres + Studio at :54323
pnpm db:migrate                # applies supabase/migrations
pnpm --filter @pickupvb/supabase gen:types   # regenerate DB types
```

Copy the printed `anon key` and `service_role key` into `.env`.

### Run everything

```bash
pnpm dev                       # turbo runs the Next.js app on :3000 (UI + /api/*)
```

Available endpoints (all served by the Next.js app) — full reference with
auth, error codes, and CSV-export details in
[docs/api-reference.md](docs/api-reference.md):

- `GET /api/health` · `GET /api/health/deep`
- `GET /api/events?...filters` · `POST /api/events` · `GET /api/events/[id]`
- `POST /api/events/[id]/join` · `POST /api/events/[id]/leave`
- `GET /api/events/[id]/attendees.csv` (Pro)
- `GET /api/receipts/[year]/statement.csv` · `GET /api/earnings/[year]/statement.csv`
- `POST /api/notifications/subscribe` · `/api/notifications/worker` (cron) · `/api/notifications/reminders` (cron)
- `POST /api/webhooks/stripe` · `GET /api/geocode/autocomplete` · `GET /api/sentry-test`

## Deploying

### Web + API (Vercel)

1. Import this repo into Vercel.
2. Set **Root Directory** to `apps/web`.
3. Add the env vars from `.env.example`.
   - `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
     (the `sb_publishable_...` key) → exposed to the browser.
   - `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (the `sb_secret_...` key) →
     server-only, used by Route Handlers via the admin client.
   - These are the new Supabase API keys
     ([discussion #29260](https://github.com/orgs/supabase/discussions/29260)).
4. Every push to `main` triggers a production build automatically. Route
   Handlers run on the Vercel Node.js runtime — no separate API host required.

### Database (Supabase Cloud)

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

## Auth evaluation (free / cheap)

| Provider      | Free tier         | Notes                                          |
| ------------- | ----------------- | ---------------------------------------------- |
| **Supabase**  | 50k MAU           | **Chosen.** Native to our DB, RLS, OAuth, free |
| Clerk         | 10k MAU           | Best DX, but separate user table from Supabase |
| Auth.js       | Self-hosted, free | More wiring, no managed UI                     |
| Firebase Auth | Unlimited (Spark) | Adds another vendor; weak Postgres story       |

Supabase Auth wins because it: (a) shares a JWT with the database, enabling
RLS, (b) has a generous free tier, and (c) ships first-party Next.js SSR
helpers (`@supabase/ssr`).

## Domain rules implemented

- Indoor events: 6s or quads only.
- Outdoor (grass / sand): 6s, quads, triples, or doubles.
- Open-play events have a fixed or unlimited capacity.
- Tournaments require team-based signup.
- Visibility: public / invite-only / friends-of-host / friends-of-attendees
  (enforced by Postgres RLS + replicated to the domain layer).
- Real-time updates: `event_attendees` and `event_teams` are added to the
  `supabase_realtime` publication so all viewers of an event detail page get
  live spot counts via the `useEventAttendees` hook.

## Scripts (root)

| Script                                     | What it does                     |
| ------------------------------------------ | -------------------------------- |
| `pnpm dev`                                 | Run web + api in parallel        |
| `pnpm build`                               | Build everything                 |
| `pnpm typecheck`                           | TS typecheck across all packages |
| `pnpm lint`                                | Lint all packages                |
| `pnpm test`                                | Run tests across all packages    |
| `pnpm supabase:start` / `:stop` / `:reset` | Manage local Supabase            |
| `pnpm db:migrate`                          | Apply pending migrations         |
