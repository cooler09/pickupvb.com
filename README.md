# PickupVB

Find, host, and manage volleyball events — indoor, grass, and beach. Open play
and tournaments. Real-time spot updates. Host tools (brackets, seeding, scoring).

## Stack

| Layer       | Tech                                         |
| ----------- | -------------------------------------------- |
| Monorepo    | pnpm workspaces + Turborepo                  |
| Frontend    | Next.js 14 (App Router) + React 18 + Tailwind |
| Backend API | NestJS 10 + Fastify + `@nestjs/cqrs`         |
| Database    | Supabase (Postgres 15 + PostGIS + Realtime)  |
| Auth        | Supabase Auth (email/password + OAuth)       |
| Hosting     | Vercel (web), Fly.io (API), Supabase (DB)    |
| CI/CD       | GitHub Actions + Vercel auto-deploy on push  |

## Architecture

```
.
├── apps/
│   ├── web/    # Next.js App Router – Tailwind, RSC, Supabase SSR auth
│   └── api/    # NestJS + CQRS – commands, queries, controllers
├── packages/
│   ├── domain/    # DDD aggregates (VolleyballEvent, Team, UserProfile)
│   ├── types/     # Shared DTOs & Zod schemas
│   ├── supabase/  # Typed browser/server/admin clients
│   └── config/    # Tailwind preset + tsconfig presets
└── supabase/
    ├── config.toml
    └── migrations/
```

### DDD layout (per feature)

Each feature module in the API follows the same structure:

```
events/
├── application/         # CQRS messages, command/query handlers
│   ├── commands/
│   ├── queries/
│   └── messages.ts
├── infrastructure/      # Adapters implementing domain ports (repositories)
└── events.controller.ts # HTTP boundary – validates input, dispatches messages
```

Domain logic (invariants like _"indoor events can only be 6s or quads"_) lives
in [`packages/domain`](packages/domain) and is consumed by the API and the web
form validators alike (single source of truth).

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
pnpm dev                       # turbo runs web (:3000) + api (:4000)
```

## Deploying

### Web (Vercel)

1. Import this repo into Vercel.
2. Set **Root Directory** to `apps/web`.
3. Add the env vars from `.env.example` (the `NEXT_PUBLIC_*` ones).
4. Every push to `main` triggers a production build automatically.

### API (Fly.io)

```bash
cd apps/api
fly launch --no-deploy --copy-config
fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_JWT_SECRET=...
fly deploy
```

Then add `FLY_API_TOKEN` to GitHub repo secrets — `.github/workflows/deploy-api.yml`
will deploy on every push that touches `apps/api/**` or `packages/**`.

### Database (Supabase Cloud)

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

## Auth evaluation (free / cheap)

| Provider       | Free tier                  | Notes                                          |
| -------------- | -------------------------- | ---------------------------------------------- |
| **Supabase**   | 50k MAU                    | **Chosen.** Native to our DB, RLS, OAuth, free |
| Clerk          | 10k MAU                    | Best DX, but separate user table from Supabase |
| Auth.js        | Self-hosted, free          | More wiring, no managed UI                     |
| Firebase Auth  | Unlimited (Spark)          | Adds another vendor; weak Postgres story       |

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

| Script              | What it does                              |
| ------------------- | ----------------------------------------- |
| `pnpm dev`          | Run web + api in parallel                 |
| `pnpm build`        | Build everything                          |
| `pnpm typecheck`    | TS typecheck across all packages          |
| `pnpm lint`         | Lint all packages                         |
| `pnpm test`         | Run tests across all packages             |
| `pnpm supabase:start` / `:stop` / `:reset` | Manage local Supabase     |
| `pnpm db:migrate`   | Apply pending migrations                  |
