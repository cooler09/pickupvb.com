# Dev test-account scripts

Operational CLIs for provisioning / cleaning up the **persona test accounts**
([docs/personas.md](../../../docs/personas.md)) in the **dev** Supabase project.
They use the service-role key (bypass RLS), so:

- **Dry-run by default.** Nothing mutates until you pass `--apply` (or
  `--delete` for the deleter).
- **Verify the printed `Project host` before applying.** It must be your dev
  project, never prod.
- **Credentials** come from `apps/web/.env.local` (or the environment),
  preferring `E2E_CLEANUP_SUPABASE_URL` / `E2E_CLEANUP_SUPABASE_SECRET_KEY`
  and falling back to the app's `SUPABASE_URL` / `SUPABASE_SECRET_KEY`.

Run from the repo root.

## `run-e2e.mjs`

Run the Playwright suite against dev with `.env.local` properly loaded.
Playwright doesn't auto-load `.env.local`, and `source`-ing it is fragile
(multi-line keys break the shell), so this loads it with the same parser the
admin scripts use, maps `E2E_CLEANUP_SUPABASE_*` from `SUPABASE_*`, defaults the
target to dev, and execs `playwright test`. Extra args pass through.

```bash
node apps/web/scripts/run-e2e.mjs persona-            # just the persona specs
node apps/web/scripts/run-e2e.mjs                     # whole suite
node apps/web/scripts/run-e2e.mjs --grep-invert @destructive
```

## `delete-test-user.mjs`

Delete a persona/test account (profile row, then auth user). Refuses non-`+`
aliased emails unless `--force`.

```bash
# dry-run (read-only) — shows what would be deleted
node apps/web/scripts/delete-test-user.mjs zacharyjordan82+greg@gmail.com
# actually delete
node apps/web/scripts/delete-test-user.mjs zacharyjordan82+greg@gmail.com --apply
```

## `set-host-subscription.mjs`

Set a host's Pro subscription state. `is_pro_host` (the perk gate) is true only
for `trialing` / `active` / `past_due`; `canceled` (and `unpaid`, …) is
lapsed/Free. The account must already exist (sign in once) — the row FKs to
`profiles(id)`.

```bash
# Rachel (P17) lapsed → Free
node apps/web/scripts/set-host-subscription.mjs zacharyjordan82+rachel@gmail.com canceled --apply
# A Pro host (e.g. seeding Mark/Diana without driving Stripe)
node apps/web/scripts/set-host-subscription.mjs <email> active --plan yearly --apply
# Grace window (still Pro, failing payment)
node apps/web/scripts/set-host-subscription.mjs <email> past_due --apply
```

⚠️ This only changes the DB. If the host has a live Stripe subscription, a later
`customer.subscription.*` webhook can re-sync and overwrite it — cancel in
Stripe too (Customers → the `cus_…` id) for a permanent change. See
[docs/personas.md](../../../docs/personas.md) for which persona wants which
state, and [docs/stripe-webhooks.md](../../../docs/stripe-webhooks.md) for how
state is mirrored.
