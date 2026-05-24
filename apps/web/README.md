# @pickupvb/web

The Next.js 16 App Router front-end and HTTP boundary for pickupvb.com.
Hosts every user-facing page, every server action, every API route
handler, and the **composition root** that wires application-layer
handlers to infrastructure adapters.

> Agents: read [AGENTS.md](../../AGENTS.md) at the repo root first — it
> covers the page-composition conventions, server-action patterns,
> typed-`DomainError` boundary, and the verify quad. This README is a
> map; AGENTS.md is the rulebook.

## Layout

```
src/
├── app/                         # Next.js App Router
│   ├── layout.tsx               # root layout, fonts, providers
│   ├── page.tsx                 # marketing landing
│   ├── error.tsx · global-error.tsx · not-found.tsx
│   ├── opengraph-image.tsx · sitemap.ts · robots.ts
│   ├── _components/             # cross-route shared UI (underscore = not a route)
│   ├── api/                     # route handlers
│   │   ├── webhooks/            #   stripe, resend, web-push
│   │   ├── notifications/       #   worker + per-user delivery
│   │   ├── events/ · earnings/ · receipts/ · geocode/ · health/
│   ├── auth/ · login/ · forgot-password/ · reset-password/ · claim/
│   ├── events/                  # /events, /events/new, /events/[id]/*
│   │   └── [id]/
│   │       ├── page.tsx         # thin orchestrator (~294 LOC after Bundle 24)
│   │       ├── _components/     # co-located sub-components
│   │       ├── _loaders/        # data-loading helpers (loadEventDetail, …)
│   │       ├── *-actions.ts     # 'use server' files per concern (rsvp, co-host, …)
│   │       └── edit/ · checkout/ · bracket/ · team-checkout/ · roster-team-checkout/
│   ├── groups/ · teams/ · players/ · friends/ · community/
│   ├── profile/ · pricing/ · legal/ · tools/
│   └── e/                       # short-link redirect handler
├── components/                  # global UI primitives
├── hooks/
├── lib/                         # see "Library landmarks" below
└── proxy.ts                     # next/server proxy entry (middleware-style)
```

## Library landmarks

A few files in [src/lib/](src/lib/) are load-bearing — start here when
you need to understand the boundary:

| File                                                                                | Role                                                                                                           |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [handlers.ts](src/lib/handlers.ts)                                                  | **Composition root.** Constructs every Supabase repository adapter and binds it to its application handler.    |
| [api-helpers.ts](src/lib/api-helpers.ts)                                            | HTTP boundary. Maps `DomainError` subclasses → status codes + `{ error, message, details }` JSON.              |
| [supabase.ts](src/lib/supabase.ts)                                                  | `getServerSupabase()` — SSR client honoring user cookies. **Use this in pages/actions, never the admin one.**  |
| [supabase-admin.ts](src/lib/supabase-admin.ts)                                      | Service-role client. Only inside infrastructure paths that need RLS bypass.                                    |
| [server-auth.ts](src/lib/server-auth.ts)                                            | `getUser()`/`requireUser()` and the anonymous-auth (`is_anonymous`) guard.                                     |
| [form-data.ts](src/lib/form-data.ts)                                                | `field()` / `fieldOrNull()` / `fieldOrUndefined()` / `bool()` — handle `useFormState`'s `1_email` slot prefix. |
| [stripe.ts](src/lib/stripe.ts) · [checkout-session.ts](src/lib/checkout-session.ts) | Stripe SDK construction + checkout-session helpers used by `*-checkout-actions.ts`.                            |
| [notify.ts](src/lib/notify.ts)                                                      | Thin shim into `@pickupvb/notifications`.                                                                      |
| [rate-limit.ts](src/lib/rate-limit.ts) · [turnstile.ts](src/lib/turnstile.ts)       | Edge-friendly rate limit + Cloudflare Turnstile verification used on public boundaries.                        |

## Conventions (cross-link)

These live in [AGENTS.md](../../AGENTS.md) — the canonical reference.
The short version:

- **Pages are thin orchestrators** (target < ~150 LOC). Co-locate
  sub-components under `_components/` and server actions in `*-actions.ts`
  files next to the page.
- **`'use server'` at the top of an actions file**, not per function.
- **Plain `<form action={fn}>`** → flash-param redirects on failure
  (`?rsvp=error`). **Client-invoked actions** (`useTransition` /
  `useFormState` / optimistic UI) → return a typed
  `Result<T, DomainErrorCode>` instead of throwing.
- **Wrap typed actions in a `*FromForm(...formData: FormData)` adapter**
  bound at the call site with `.bind(null, id, returnPath)`. Always
  thread `returnPath` so the action can `revalidatePath(returnPath)`
  at the end.
- **Map snake_case DB rows → camelCase props at the page boundary.**
  Components take camelCase; don't push DB shape into reusable UI.
- **Throw typed [`DomainError`](../../packages/domain/src/shared/result.ts)
  subclasses; never `throw new Error('CODE')`.** The helper in
  [api-helpers.ts](src/lib/api-helpers.ts) maps them for routes and the
  flash-param pattern keys off `instanceof` for forms.
- **Typed routes are on** (`typedRoutes: true`). Dynamic `href`s need
  template literals matching the route pattern (`` `/groups/${id}` ``).
- **`exactOptionalPropertyTypes: true`** — spread conditional optional
  props (`{...(cond ? { prop } : {})}`), don't pass `undefined`.

## Scripts

```bash
pnpm --filter @pickupvb/web dev          # next dev --webpack -p 3000
pnpm --filter @pickupvb/web build        # next build --webpack
pnpm --filter @pickupvb/web typecheck    # tsc --noEmit
pnpm --filter @pickupvb/web lint         # eslint .
pnpm --filter @pickupvb/web test         # vitest run (form-data, money, turnstile)
pnpm --filter @pickupvb/web e2e          # playwright test
```

**Why `--webpack`?** [next.config.mjs](next.config.mjs) installs a
`config.resolve.extensionAlias` so NodeNext-style `.js` import specifiers
resolve to the workspace packages' `.ts` sources. Turbopack ignores the
`webpack()` callback today, so dropping the flag breaks the build. See
the [Bundle 29 journal](../../docs/journal/2026-05-22-bundle-29.md) for
the full investigation. A Turbopack-native migration is deferred to its
own bundle.

## Environment

Env-var setup, Supabase project config, and Vercel deploy details live
in the [repo README](../../README.md) and
[docs/runbook.md](../../docs/runbook.md). Sentry is wired through
[instrumentation.ts](instrumentation.ts) + the `sentry-*.config.ts`
files at this package root.
