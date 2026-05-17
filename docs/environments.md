# Environments

PickupVB runs in two cloud environments. **Production** is the public site
at <https://pickupvb.com>; **development** is a staging mirror at
<https://dev.pickupvb.com> used for integration testing before promotion.

## Topology

| Environment | URL                        | Git branch | Vercel                                                     | Supabase                            | Stripe         |
| ----------- | -------------------------- | ---------- | ---------------------------------------------------------- | ----------------------------------- | -------------- |
| Production  | <https://pickupvb.com>     | `main`     | Production deployment of the `pickupvb.com` Vercel project | Hosted Supabase project (prod ref)  | Live mode keys |
| Development | <https://dev.pickupvb.com> | `develop`  | Branch-aliased preview of the same Vercel project          | Separate Supabase project (dev ref) | Test mode keys |

Both environments run from the same Vercel project and the same GitHub
repository. They are isolated only at the data layer (Supabase project,
Stripe account mode) and at the env-var layer (Vercel environment
selectors). Application code is identical.

## Branching workflow

```
feature/* ──PR──► develop ──auto-deploy──► dev.pickupvb.com
                       │
                       └──PR──► main ──auto-deploy──► pickupvb.com
```

- Day-to-day feature branches target `develop`.
- `develop` → `main` is the promote step. Use squash merge to keep `main`
  linear; or fast-forward if `develop` is a clean ancestor.
- Hot-fixes can branch from `main` and PR back to both `main` and
  `develop`.

## Per-environment URL handling

The `apps/web/src/lib/app-url.ts` helper exposes:

- `APP_URL` — `NEXT_PUBLIC_APP_URL` with the production apex as fallback.
  Use for share/CTA links that should match the host the visitor is on.
- `PROD_APP_URL` — the literal production apex. Use for SEO-canonical
  identifiers (`metadataBase`, JSON-LD `@id`, sitemap URLs) so dev /
  preview deployments do not cannibalize production indexing.
- `IS_PROD_HOST` — boolean. Gate behavior that should only run on the
  canonical production deployment (real `robots.txt`, full `sitemap.xml`,
  …).

On the dev deployment, [robots.ts](../apps/web/src/app/robots.ts) returns
`Disallow: /` and [sitemap.ts](../apps/web/src/app/sitemap.ts) returns
an empty list, so search engines never index `dev.pickupvb.com`.

## One-time setup checklist

These steps happen outside the repo. Track them in the deployment runbook
once complete.

### 1. Supabase dev project

1. Create a new project in the Supabase dashboard (e.g. `pickupvb-dev`).
2. Record the project ref, anon publishable key, secret key, and DB
   password.
3. **Auth → URL Configuration** — add redirect URLs:
   - `https://dev.pickupvb.com/auth/callback`
   - `http://localhost:3000/auth/callback`
4. Enable anonymous sign-in if production has it.
5. Recreate any OAuth providers configured in production.
6. The first migration push (see step 3 below) will create all tables;
   seed data is optional.

### 2. DNS

Add a CNAME at the registrar:

```
dev    CNAME    cname.vercel-dns.com.
```

Vercel will provision the TLS cert automatically once the record
resolves.

### 3. GitHub repository configuration

Settings → **Environments** → create two environments:

- `production`
- `development`

Add the following secrets to **each** environment (values differ per
environment):

| Secret                 | Source                                       |
| ---------------------- | -------------------------------------------- |
| `SUPABASE_PROJECT_REF` | Supabase project Settings → General          |
| `SUPABASE_DB_PASSWORD` | Database password set at project create time |

Keep `SUPABASE_ACCESS_TOKEN` (the personal/CI access token used by the
Supabase CLI to authenticate) as a **repository-level** secret — same
token works for both environments.

The [supabase-migrations workflow](../.github/workflows/supabase-migrations.yml)
selects the right environment based on `github.ref_name`:

- Push to `main` → `production` environment → prod Supabase project.
- Push to `develop` → `development` environment → dev Supabase project.
- `workflow_dispatch` accepts an `environment` input for manual pushes.

Push the `develop` branch with a no-op migration commit to verify the
job picks up the dev secrets correctly the first time.

### 4. Vercel project configuration

1. **Settings → Domains:** add `dev.pickupvb.com`. When prompted, assign
   it to the **`develop` Git Branch**. Vercel will then deploy that
   branch to that domain on every push.
2. **Settings → Environment Variables:** for each variable in
   [.env.example](../.env.example), set values for both Production and
   Preview (Preview is what `develop` deploys against, scoped by branch
   under "Preview" → "Specific branches" → `develop`).

   Per-environment differences:

   | Variable                               | Production value                  | Development value                                                      |
   | -------------------------------------- | --------------------------------- | ---------------------------------------------------------------------- |
   | `NEXT_PUBLIC_APP_URL`                  | `https://pickupvb.com`            | `https://dev.pickupvb.com`                                             |
   | `NEXT_PUBLIC_SUPABASE_URL`             | prod project URL                  | dev project URL                                                        |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | prod `sb_publishable_…`           | dev `sb_publishable_…`                                                 |
   | `SUPABASE_URL`                         | prod project URL                  | dev project URL                                                        |
   | `SUPABASE_SECRET_KEY`                  | prod `sb_secret_…`                | dev `sb_secret_…`                                                      |
   | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`       | prod Turnstile site key           | dev Turnstile site key                                                 |
   | `TURNSTILE_SECRET_KEY`                 | prod Turnstile secret             | dev Turnstile secret                                                   |
   | `STRIPE_SECRET_KEY`                    | `sk_live_…`                       | `sk_test_…`                                                            |
   | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`   | `pk_live_…`                       | `pk_test_…`                                                            |
   | `STRIPE_WEBHOOK_SECRET`                | prod endpoint `whsec_…`           | dev endpoint `whsec_…`                                                 |
   | `STRIPE_PRO_MONTHLY_PRICE_ID`          | live price id                     | test-mode price id                                                     |
   | `STRIPE_PRO_YEARLY_PRICE_ID`           | live price id                     | test-mode price id                                                     |
   | `RESEND_FROM`                          | `PickupVB <noreply@pickupvb.com>` | `PickupVB Dev <dev-noreply@pickupvb.com>` (or leave unset to log-only) |
   | `CRON_SECRET`                          | distinct value                    | distinct value                                                         |
   | `NEXT_PUBLIC_SENTRY_DSN`               | prod DSN                          | dev DSN (or same DSN + different `SENTRY_ENVIRONMENT`)                 |

   `RESEND_API_KEY`, `SENTRY_AUTH_TOKEN`, and `SENTRY_ORG` can be shared
   across environments.

### 5. Third-party allow-lists

- **Cloudflare Turnstile** — create a separate site for
  `dev.pickupvb.com` (or add it as an allowed hostname on the existing
  site, but separate sites are cleaner).
- **Stripe** — in test mode, add a webhook endpoint pointing at
  `https://dev.pickupvb.com/api/webhooks/stripe`. Capture the signing
  secret into the Vercel dev env vars above.
- **OAuth providers** — register
  `https://dev.pickupvb.com/auth/callback` as an additional redirect
  URI on every OAuth app configured in production.
- **Resend** — verify a sender subdomain or address you intend to use
  for dev mail. Until then, leave `RESEND_API_KEY` unset on dev so the
  worker logs instead of sending.

### 6. Vercel Cron

Vercel cron only runs from production deployments by default. If a job
needs to run on dev as well (rare — usually you want dev cron disabled
to avoid double-firing on prod data), duplicate the cron config in the
project settings scoped to the `develop` branch. Most jobs should stay
prod-only.

## Local development

`pnpm dev` reads `.env` (gitignored). Keep your local `.env` pointed at
either the dev Supabase project (cleaner; mirrors what's on
`dev.pickupvb.com`) or a local Supabase via `pnpm supabase:start`. Never
point local dev at production.

## Promotion checklist (`develop` → `main`)

Before opening the PR from `develop` to `main`:

1. `pnpm typecheck && pnpm lint && pnpm build` clean on the latest
   `develop` head.
2. Smoke-test the surfaces you touched on `dev.pickupvb.com`.
3. If the changeset includes Supabase migrations, confirm they applied
   cleanly on dev (Settings → Database → Migrations history in the
   Supabase dashboard) and that the app behaves correctly against the
   new schema.
4. Open the PR, get review, squash-merge into `main`. Vercel deploys to
   production and the migrations workflow applies the same files to the
   prod Supabase project.
