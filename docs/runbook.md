# Deployment & operations runbook

Operational reference for shipping, rolling back, and recovering from common
incidents on pickupvb.com.

> **Solo project.** There is no on-call rotation. The author is the responder
> for every incident below. If that changes, add a rotation/contact section.

## Environments

| Environment | URL | Source | Database |
|---|---|---|---|
| Production | https://pickupvb.com | `main` branch, auto-deployed by Vercel | Hosted Supabase project |
| Preview | `*.vercel.app` (per PR) | Any non-`main` branch | Same hosted Supabase project (be careful — preview deploys hit prod data) |
| Local | http://localhost:3000 | Working tree | Local `supabase start` stack |

There is currently **no dedicated staging environment**. Vercel preview
deploys substitute for it, but they share the production database. Avoid
running destructive operations from a preview branch.

## Standard deploy flow

1. Branch from `main`, work, open a PR.
2. Run the verification triple locally:
   ```bash
   pnpm typecheck && pnpm lint && pnpm build
   ```
3. Push. The PR triggers a Vercel preview build. Smoke-test the preview URL
   against the changed surface area.
4. Merge to `main`. Vercel rebuilds and deploys.
5. **Any new file in [supabase/migrations/](../supabase/migrations/) is
   applied to production automatically** as part of the deploy pipeline.
   Confirm in the Vercel deployment logs that the migration step ran clean.
6. Verify on production: load the affected pages, exercise the changed flow.

Never run `supabase db push` against the production project by hand. Always
add a migration file and let CI apply it.

## Rollback

### Code rollback (no migration)

Fastest path: redeploy the previous build from the Vercel dashboard.

1. Vercel → project → Deployments
2. Find the last known-good production deployment.
3. Click "..." → "Promote to Production".

Takes ~30 seconds and is fully reversible. Follow up with `git revert <sha>`
and merge so `main` matches what's actually serving.

### Code rollback when a bad migration shipped

A migration cannot be "undone" by reverting the file — the migration already
ran. Two recovery paths:

1. **Forward fix (preferred):** write a follow-up migration that undoes or
   corrects the bad change. Ship it like any other migration.
2. **Schema rollback (last resort):** in the Supabase SQL editor, run the
   inverse statements by hand. Then write a follow-up migration that
   re-applies the inverse so local dev matches prod, and remove the
   offending migration file from the tree in the same PR. Document what
   you did inline at the top of the new migration.

Never delete an applied migration file without a follow-up that captures the
schema change — local dev will desync.

### Migration failed partway

The most common shape: the migration started, partially applied, and aborted.

1. Inspect what landed via the Supabase SQL editor (`select * from
   information_schema.columns where table_name = '...'`).
2. If the migration was wrapped in a transaction (the default for `psql` /
   `supabase migration up`), nothing committed — just fix the file and
   redeploy.
3. If the migration ran outside a transaction (e.g. `CREATE INDEX
   CONCURRENTLY`), some statements landed and some didn't. Hand-finish or
   hand-unwind via the SQL editor, then write a follow-up migration that
   is idempotent (`create ... if not exists`, etc.) so re-running it is
   safe.
4. Regenerate types and re-run the verification triple:
   ```bash
   pnpm --filter @pickupvb/supabase gen:types
   pnpm typecheck && pnpm lint && pnpm build
   ```

## Bypassing auto-deploy in an emergency

Vercel auto-deploys every push to `main`. To stop deploys temporarily:

- Vercel → project → Settings → Git → "Disable deployments". Re-enable when
  the issue is resolved.

For a single bad commit, you can also push a revert immediately — Vercel
will deploy the revert in <2 min, which is usually faster than disabling.

## Common incidents

### Stripe webhook 5xx storm

Symptom: Stripe dashboard shows repeated webhook failures.

1. Pull recent logs from Vercel for `/api/webhooks/stripe`.
2. Confirm the webhook signing secret matches Stripe → Developers →
   Webhooks → (endpoint) → Signing secret. A rotation requires updating
   `STRIPE_WEBHOOK_SECRET` in Vercel env and redeploying.
3. The handler is idempotent via the `stripe_webhook_events` dedupe table
   (see [docs/stripe-webhooks.md](stripe-webhooks.md)). Once the underlying
   bug is fixed, Stripe's retries will redeliver successfully.

### Push-notification worker errors

Symptom: rising error rate on `/api/notifications/worker`.

1. Pull worker logs from Vercel.
2. Subscriptions that return `410 Gone` are already pruned by the worker —
   those are expected and not actionable.
3. If errors are concentrated on a single subscription, manually delete the
   row in `push_subscriptions`.

### Supabase outage

Supabase status: https://status.supabase.com

If the database is unreachable, every server-rendered page will 500. There
is no application-side fallback. Wait for restoration and verify the next
deploy still typechecks against the live schema.

## Where to look

| Concern | Dashboard |
|---|---|
| App logs & deployments | Vercel → project → Logs / Deployments |
| Database queries, RLS, SQL editor | Supabase project dashboard |
| Stripe events, webhook deliveries | Stripe dashboard → Developers → Events / Webhooks |
| Email delivery | Resend dashboard |
| Web vitals & real-user metrics | Vercel Analytics + Speed Insights tabs |
| Error reporting | Sentry (if DSN configured — see [integrations.md](integrations.md#sentry)) |

## Verification checklist before declaring incident resolved

1. The originating symptom is gone on production.
2. `pnpm typecheck && pnpm lint && pnpm build` is green on `main`.
3. The remediation is captured in either a migration, a code change in
   `main`, or a follow-up issue.
4. If a recurring class of incident, add a section to this runbook.
