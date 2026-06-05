import { sweepLeakedE2EFixtures } from './_helpers/cleanup';

/**
 * Global teardown — reclaim leaked `E2E ` fixtures at the end of every run.
 *
 * Most mutating specs clean up their own fixture in a `finally`/`afterAll`, but
 * a UI cancel leaves a `status='cancelled'` event behind and a captain
 * soft-delete leaves a `deleted_at` team behind; without
 * `E2E_CLEANUP_SUPABASE_*` the per-spec admin hard-delete is a no-op and those
 * rows accumulate run over run. This sweep is the safety net.
 *
 * Two safety properties make it safe to auto-run:
 *   1. **No-op without creds.** `sweepLeakedE2EFixtures` returns zeros when
 *      `E2E_CLEANUP_SUPABASE_*` is unset, so a plain `pnpm e2e` from a fork
 *      deletes nothing.
 *   2. **1-hour age guard.** Only fixtures older than an hour are reclaimed, so
 *      a second run executing concurrently against the same environment (whose
 *      fixtures are always < 1h old) is never clobbered. This is why the sweep
 *      was previously manual-only — the guard removes that hazard.
 *
 * Opt out entirely (e.g. when debugging leaked fixtures you want to inspect)
 * with `E2E_NO_TEARDOWN_SWEEP=1`.
 */
export default async function globalTeardown(): Promise<void> {
  if (process.env.E2E_NO_TEARDOWN_SWEEP) return;

  const result = await sweepLeakedE2EFixtures({ olderThanHours: 1 });
  const total = result.events + result.groups + result.teams + result.community_listings;
  if (total > 0) {
    console.log(
      `[e2e teardown] swept ${total} leaked E2E fixture(s) older than 1h: ${JSON.stringify(result)}`,
    );
  }
}
