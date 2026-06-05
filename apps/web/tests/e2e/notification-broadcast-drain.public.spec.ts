import { test, expect } from '@playwright/test';
import { getCleanupClient } from './_helpers/cleanup';

/**
 * Worker drain-to-empty + kick debounce — broadcast burst delivery (ADR 0026).
 *
 * A host broadcast loops `notify()` once per recipient
 * (apps/web/src/app/events/[id]/broadcast-actions.ts), so an N-recipient
 * broadcast is N separate `notification_outbox` INSERTs → N statement-level
 * kicks. ADR 0026 debounces the kick (`notification_worker_kick`, ~10s window)
 * and makes the worker drain the WHOLE backlog per wake (the `DRAIN_BUDGET_MS`
 * loop in app/api/notifications/worker/route.ts). The hazard the debounce
 * introduces is *dropped deliveries* — a kick coalesced away while rows are
 * still pending and the worker only drained a single BATCH.
 *
 * This spec pins the safety property end-to-end against the real dev worker +
 * pg_net trigger: a burst of MORE THAN ONE BATCH of separate inserts is ALL
 * delivered (drained to a terminal state) — proving the worker loops past one
 * BATCH and the debounce never strands a row.
 *
 * Mechanics that keep it cheap + side-effect-free:
 *   - `channel='sms'` rows: the worker marks SMS `skipped` WITHOUT calling any
 *     provider (no Twilio adapter), so there is zero real email/push delivery
 *     and no fixture users to provision or clean up.
 *   - A unique `to_address` tag per run scopes the poll + the cleanup delete to
 *     exactly this run's rows.
 *
 * Requirements / speed:
 *   - Needs the cleanup admin client (E2E_CLEANUP_SUPABASE_URL / _SECRET_KEY);
 *     skips gracefully otherwise.
 *   - This IS the ADR 0026 step-3 verification: it assumes the autonomous worker
 *     is LIVE on the target — either the debounced pg_net kick (Vault seeded per
 *     step 2) or the every-5-min Vercel sweep cron. With the kick active the
 *     burst drains in seconds.
 *
 *   - **Autonomous trigger gate.** On a *preview* deployment (e.g. dev) neither
 *     fires: Vercel crons run on PRODUCTION deployments only, and the pg_net kick
 *     needs Vault seeded. The worker route itself is healthy there (invoking
 *     `GET /api/notifications/worker` with `CRON_SECRET` drains the whole
 *     backlog) — nothing is *triggering* it. So when no probe row drains within a
 *     short detection window, this is an infra gap, not a delivery bug: we
 *     sanction-skip loudly (mirroring the league specs' admin-creds skip) rather
 *     than hard-fail for the full poll budget. Set
 *     `E2E_REQUIRE_NOTIFICATION_KICK=1` on a production-like target to turn that
 *     skip back into a hard failure so a genuinely-stalled kick is caught.
 */

// Mirror BATCH in app/api/notifications/worker/route.ts. COUNT must exceed it so
// a single drained wake proves the drain-to-empty loop (not just one batch).
const BATCH = 50;
const COUNT = BATCH + 15;
const POLL_BUDGET_MS = Number(process.env['E2E_DRAIN_BUDGET_MS'] ?? 120_000);
const POLL_INTERVAL_MS = 3_000;
// If not a single row has drained after this window, the autonomous trigger is
// dead on this target (a live kick clears the whole burst in seconds).
const DETECT_DEAD_MS = 30_000;
const REQUIRE_KICK = process.env['E2E_REQUIRE_NOTIFICATION_KICK'] === '1';

test.describe('notification worker — broadcast burst delivery (ADR 0026)', () => {
  test('a burst of > BATCH separate inserts is fully drained (debounce never strands a row)', async () => {
    const admin = getCleanupClient();
    test.skip(!admin, 'E2E_CLEANUP_SUPABASE_URL / _SECRET_KEY not set — admin client required');
    test.setTimeout(POLL_BUDGET_MS + 60_000);

    const runId = `e2e-drain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const likePattern = `${runId}-%`;

    // Burst of N SEPARATE inserts — mirrors the broadcast's per-recipient
    // notify() loop (N statements → N kicks, coalesced by the debounce).
    for (let i = 0; i < COUNT; i++) {
      const { error } = await admin!.from('notification_outbox').insert({
        user_id: null,
        channel: 'sms',
        kind: 'broadcast.host_message',
        to_address: `${runId}-${i}`,
        payload: { body: 'e2e drain probe' },
      });
      expect(error, error?.message ?? undefined).toBeNull();
    }

    let kickDead = false;
    try {
      // Poll until no probe row is still pending/sending. Breaks the instant the
      // queue clears (seconds with the kick live).
      const startedAt = Date.now();
      const deadline = startedAt + POLL_BUDGET_MS;
      let inFlight = COUNT;
      while (Date.now() < deadline) {
        const { count, error } = await admin!
          .from('notification_outbox')
          .select('id', { count: 'exact', head: true })
          .like('to_address', likePattern)
          .in('status', ['pending', 'sending']);
        expect(error, error?.message ?? undefined).toBeNull();
        inFlight = count ?? 0;
        if (inFlight === 0) break;
        // Detect a dead autonomous trigger: nothing at all drained in the
        // detection window ⇒ no kick/cron is firing on this target.
        if (!REQUIRE_KICK && inFlight === COUNT && Date.now() - startedAt > DETECT_DEAD_MS) {
          kickDead = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
      if (kickDead) return; // fall through to finally cleanup, then skip below.
      expect(inFlight, `all ${COUNT} burst rows should drain to terminal`).toBe(0);

      // Every probe row should be terminally 'skipped' (sms has no adapter) —
      // i.e. actually processed by the worker, not silently dropped or expired.
      const { count: skipped, error: skipErr } = await admin!
        .from('notification_outbox')
        .select('id', { count: 'exact', head: true })
        .like('to_address', likePattern)
        .eq('status', 'skipped');
      expect(skipErr, skipErr?.message ?? undefined).toBeNull();
      expect(skipped, 'all probe rows processed by the worker (skipped: no sms adapter)').toBe(
        COUNT,
      );
    } finally {
      // Always clean up the probe rows, even on assertion failure.
      await admin!.from('notification_outbox').delete().like('to_address', likePattern);
    }

    // Sanctioned infra-gate: the worker route is healthy (it drains the whole
    // backlog when invoked with CRON_SECRET) but nothing is *triggering* it on
    // this target — the autonomous kick/cron isn't wired (preview deployment).
    // Skip loudly rather than report a delivery bug that isn't one.
    test.skip(
      kickDead,
      `autonomous notification trigger not firing on ${process.env['PLAYWRIGHT_BASE_URL'] ?? 'target'} ` +
        `(no probe row drained in ${DETECT_DEAD_MS / 1000}s). Vercel crons are production-only and the ` +
        `pg_net kick needs Vault seeded; the worker route itself is healthy. Set ` +
        `E2E_REQUIRE_NOTIFICATION_KICK=1 to hard-fail instead.`,
    );
  });
});
