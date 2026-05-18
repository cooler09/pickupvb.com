# Setting up `dev.pickupvb.com`

Step-by-step runbook for standing up the development environment. Pairs
with [.env.dev](../.env.dev) (template values) and
[docs/environments.md](environments.md) (topology reference).

> **Audience:** the person doing the one-time setup. Most steps happen in
> third-party dashboards — they can't be scripted from the repo.
> **Time:** ~60 minutes once you have accounts on Supabase, Vercel,
> Stripe, Cloudflare, and your domain registrar.

## Prerequisites

- Owner / admin access to:
  - GitHub repo (`pickupvb.com`)
  - Vercel project (`pickupvb.com`)
  - Supabase organization
  - Stripe account (test mode is sufficient — same account as prod)
  - Cloudflare account hosting the Turnstile sites
  - DNS provider for `pickupvb.com`
  - Sentry organization
  - Resend account (optional — can defer if leaving dev mail log-only)
- Locally: `supabase` CLI, `gh` CLI (optional but nice), `openssl`.
- Repo at a clean working tree.

---

## Step 1 — Create the `develop` branch

```bash
cd /Users/zachary/Documents/projects/github/pickupvb.com
git checkout main
git pull --ff-only
git checkout -b develop
git push -u origin develop
```

In **GitHub → Settings → Branches**:

1. Set branch protection on `develop`:
   - Require status checks: select the `build` job from `CI`.
   - Require PRs before merge (1 approval if you have collaborators; can
     be 0 for a solo project — but still require PRs to keep history
     clean).
2. Keep the existing `main` protection rules unchanged.

(Optional) **Settings → General → Default branch:** consider switching
the default to `develop` so new PRs and forks open against dev by
default. `main` stays as the production branch.

---

## Step 2 — Create the dev Supabase project

1. Open <https://supabase.com/dashboard> → **New project**.
   - Name: `pickupvb-dev`
   - Org: same as prod.
   - Region: same region as prod.
   - DB password: generate a strong one and store in your password
     manager. You'll need it in Step 5.
2. Wait for provisioning (~2 min).
3. Capture these values into your local `.env.dev.local` (a personal
   copy of [.env.dev](../.env.dev) that stays out of git):
   - **Settings → General → Reference ID** → `SUPABASE_PROJECT_REF`
   - **Settings → API → Project URL** → `NEXT_PUBLIC_SUPABASE_URL` and
     `SUPABASE_URL` (same value)
   - **Settings → API Keys (new) → Publishable key** (`sb_publishable_…`)
     → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - **Settings → API Keys (new) → Secret key** (`sb_secret_…`)
     → `SUPABASE_SECRET_KEY`

4. **Authentication → URL Configuration:**
   - **Site URL:** `https://dev.pickupvb.com`
   - **Redirect URLs:** add
     - `https://dev.pickupvb.com/auth/callback`
     - `http://localhost:3000/auth/callback`
5. **Authentication → Providers → Email:** enable.
6. **Authentication → Providers → Anonymous:** enable (production uses
   it for guest signups).
7. Re-create any other OAuth provider rows that exist in production.
   For each provider, register an additional redirect URI at the
   provider's dashboard pointing to
   `https://dev.pickupvb.com/auth/callback`.
8. **Database → Replication:** make sure `supabase_realtime` exists.
   The schema migrations will add `event_attendees` and `event_teams`
   to it automatically, but the publication needs to exist first
   (it does by default on a new project).

Don't push migrations from your laptop — Step 6 wires up CI to do it
the first time you push to `develop`.

---

## Step 3 — Generate the dev cron secret

```bash
openssl rand -hex 32
```

Copy the output into `CRON_SECRET` in your local `.env.dev.local`.
Generate a fresh value; do not reuse the production value.

---

## Step 4 — Create a Cloudflare Turnstile dev site

1. <https://dash.cloudflare.com/?to=/:account/turnstile> → **Add site**.
2. Site name: `pickupvb-dev`
3. Hostnames: `dev.pickupvb.com` and `localhost`
4. Widget mode: same as production.
5. Copy the **Site Key** → `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
6. Copy the **Secret Key** → `TURNSTILE_SECRET_KEY`

---

## Step 5 — Configure Stripe (test mode)

1. <https://dashboard.stripe.com> → toggle **"View test data"** (top
   right).
2. **Developers → API keys:**
   - Copy the publishable key (`pk_test_…`)
     → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - Reveal and copy the secret key (`sk_test_…`)
     → `STRIPE_SECRET_KEY`
3. **Developers → Webhooks → Add endpoint:**
   - URL: `https://dev.pickupvb.com/api/webhooks/stripe`
   - Events: copy the event list from your production endpoint
     (Settings → Developers → Webhooks → click prod endpoint → "Listen
     to" reveals the list). Common ones: `checkout.session.completed`,
     `payment_intent.succeeded`, `payment_intent.payment_failed`,
     `account.updated`, `customer.subscription.*`,
     `charge.refunded`.
   - Save, then click into the endpoint → reveal **Signing secret**
     (`whsec_…`) → `STRIPE_WEBHOOK_SECRET`.
4. **Products → + Add product** (test mode):
   - Name: `Pro Host (test)`
   - Pricing: two recurring prices — monthly ($10/mo) and yearly
     ($100/yr).
   - Save, then on the product page copy each price's `price_…` ID:
     - Monthly → `STRIPE_PRO_MONTHLY_PRICE_ID`
     - Yearly → `STRIPE_PRO_YEARLY_PRICE_ID`

Leave `STRIPE_CONNECT_CLIENT_ID` blank — Express account links don't
need it (matches the prod config).

---

## Step 6 — Configure Sentry for dev

You have two options. Pick one:

**A. Separate dev project** (cleanest filtering):

1. <https://sentry.io> → **Projects → Create project** → Next.js.
2. Name: `pickupvb-web-dev`. Copy the DSN → `NEXT_PUBLIC_SENTRY_DSN`.
3. Settings → reuse the existing `SENTRY_ORG`, `SENTRY_AUTH_TOKEN`.
4. Set `SENTRY_PROJECT=pickupvb-web-dev` for the dev environment.

**B. Same project + environment tag** (simpler, same DSN):

1. Reuse the production `NEXT_PUBLIC_SENTRY_DSN`.
2. Set `SENTRY_ENVIRONMENT=development` in the dev env vars.
3. In Sentry, save a filter on `environment:development` for dev
   triage.

Either way you can leave `NEXT_PUBLIC_SENTRY_DSN` blank to no-op the
SDK if you'd rather start without Sentry on dev.

---

## Step 7 — (Optional) Resend dev sender

If you want real email from dev:

1. <https://resend.com/domains> → verify a subdomain or address you
   intend to send dev mail from (e.g. `dev-mail.pickupvb.com`).
2. **API Keys → Create API key** → scope to sending only.
3. Set `RESEND_API_KEY` and `RESEND_FROM` accordingly.

If you'd rather defer email, leave `RESEND_API_KEY` blank. The worker
logs in dev when the key is missing.

---

## Step 8 — Add DNS

At your DNS provider, add:

```
Name:   dev
Type:   CNAME
Value:  cname.vercel-dns.com.
TTL:    300 (5 min)
```

Vercel will issue the TLS cert automatically once Step 9 adds the
domain on their side and DNS resolves.

---

## Step 9 — Configure Vercel

### 9a. Add the dev domain

1. <https://vercel.com> → `pickupvb.com` project → **Settings →
   Domains → Add**.
2. Enter `dev.pickupvb.com`.
3. When prompted "Assign to Git branch", select **`develop`**.
4. Save. Vercel verifies the CNAME and provisions HTTPS.

### 9b. Add environment variables

For each row in `.env.dev`, **Settings → Environment Variables → Add
New**:

- **Key / Value:** as in `.env.dev`.
- **Environment:** Preview only.
- **Git Branch:** scope to `develop` (under "Customize environments →
  Specific branches").

Quick way to bulk-add: in the env-vars page click **Import .env →
Preview**, paste the contents of your filled-in `.env.dev.local`, then
scope the new rows to `develop`.

Variables that should be identical to production (set them at the
project level under "All Environments" if not already):

- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `RESEND_API_KEY` (if reusing)

### 9c. Cron jobs (skim — usually no change)

Vercel cron only fires from the production deployment by default, so
existing crons keep running against prod data. If you want dev to also
run a particular cron (rare — usually you don't), duplicate the cron
entry in `vercel.json` keyed to the dev deployment. **Don't enable
notification cron on dev** unless you want dev to email real users.

---

## Step 10 — Configure GitHub Environments + secrets

The migrations workflow ([.github/workflows/supabase-migrations.yml](../.github/workflows/supabase-migrations.yml))
selects the right Supabase project by GitHub Environment.

1. **Settings → Environments → New environment** → name it
   `production`.
2. Move (or copy) the existing repo-level secrets into the
   `production` environment:
   - `SUPABASE_PROJECT_REF` (prod project ref)
   - `SUPABASE_DB_PASSWORD` (prod DB password)

3. Repeat **New environment → `development`**:
   - `SUPABASE_PROJECT_REF` = dev project ref (from Step 2)
   - `SUPABASE_DB_PASSWORD` = dev DB password (from Step 2)
4. Keep `SUPABASE_ACCESS_TOKEN` at the **repository** level — the same
   personal access token authenticates the CLI against both projects.

(Optional but recommended) On the `production` environment, add a
**Required reviewer** — that gates prod migrations behind a manual
approval click. Leave `development` unrestricted so dev pushes flow
through.

---

## Step 11 — First deploy

1. From `develop`:

   ```bash
   git commit --allow-empty -m "chore: bootstrap dev environment"
   git push
   ```

2. Watch **GitHub → Actions** — the `CI` workflow should run and pass.
3. Watch **Vercel → Deployments** — a deployment of `develop` should
   build and bind to `dev.pickupvb.com`. First build can take 3–5 min.
4. The migrations workflow only runs when files under
   `supabase/migrations/**` or `supabase/config.toml` change, so the
   bootstrap commit won't trigger it. Force-trigger to seed schema:
   - **GitHub → Actions → Supabase Migrations → Run workflow** → branch
     `develop`, environment `development`, run.
   - It should `supabase link` to the dev project and `db push` every
     migration. Verify in **Supabase dashboard → Database → Migrations**
     that all rows landed.

5. Open <https://dev.pickupvb.com>. You should see the landing page
   served from a freshly migrated dev database.

---

## Step 12 — Smoke test

Walk through the critical paths on dev to confirm wiring:

- [ ] Landing page renders without console errors.
- [ ] Sign up with a new email; Supabase Auth sends the confirmation
      email (or sign in anonymously via Turnstile).
- [ ] Create an event (free tier).
- [ ] Join / leave an event.
- [ ] Create a paid event; complete checkout with Stripe test card
      `4242 4242 4242 4242` (any future expiry, any CVC). The Stripe
      webhook should fire and the attendee row should land.
- [ ] Visit <https://dev.pickupvb.com/robots.txt> — must be
      `Disallow: /` (this is enforced by `IS_PROD_HOST`).
- [ ] Visit <https://dev.pickupvb.com/sitemap.xml> — must be empty.
- [ ] Trigger a known error path — confirm it shows up in Sentry under
      the dev environment / project.

---

## Promotion to production

Once dev mirrors prod and your feature work is ready:

```bash
git checkout main
git pull --ff-only
git merge --ff-only develop   # or: open a PR for review
git push
```

Vercel auto-deploys `main` to `pickupvb.com`. The migrations workflow
auto-applies any new migrations to the **production** Supabase project
(gated by the manual approval from Step 10 if you added one).

---

## Troubleshooting

| Symptom                                                                  | Likely cause                                           | Fix                                                                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Vercel deploy succeeds but `dev.pickupvb.com` shows the prod site        | Domain still mapped to `main`                          | Settings → Domains → reassign `dev.pickupvb.com` to `develop`.                                                               |
| `dev.pickupvb.com` returns 404 invalid host                              | CNAME not propagated                                   | `dig dev.pickupvb.com` — must resolve to a `cname.vercel-dns.com` chain. Wait or fix at registrar.                           |
| Migrations workflow on `develop` fails at `supabase link`                | Wrong env secrets                                      | Confirm GitHub `development` environment has the **dev** project ref + password, not prod values.                            |
| Stripe webhook events 401                                                | Wrong `STRIPE_WEBHOOK_SECRET`                          | Re-copy from the test-mode webhook endpoint in Stripe; remember each endpoint has its own signing secret.                    |
| `dev.pickupvb.com/sitemap.xml` is not empty / `robots.txt` is permissive | `NEXT_PUBLIC_APP_URL` not set to the dev URL in Vercel | Settings → Environment Variables → set `NEXT_PUBLIC_APP_URL=https://dev.pickupvb.com` for the `develop` branch and redeploy. |
| Anonymous signup fails with "Turnstile invalid"                          | Dev hostname not on the Turnstile site                 | Cloudflare dashboard → Turnstile site → Hostname list → add `dev.pickupvb.com`.                                              |
| OAuth callback bounces to prod                                           | OAuth provider doesn't have the dev redirect URI       | Add `https://dev.pickupvb.com/auth/callback` to each enabled provider's allow-list (Google, Discord, etc.).                  |
