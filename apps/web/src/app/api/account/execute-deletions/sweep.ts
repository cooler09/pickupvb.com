/**
 * Account-deletion sweep core (ADR 0029). Pure orchestration over an injected
 * `DeletionPort` — no Supabase, no `next/*` — so the cap + per-request isolation
 * is unit-testable. The route ([route.ts](./route.ts)) wires the concrete port
 * (the deletion-request repo + `executeAccountDeletion`).
 *
 * Why its own module: a Next `route.ts` may only export route handlers + route
 * config; exporting these helpers from the route file fails the generated
 * route-type check (same reason as the reminders sweep).
 */

import type { DeletionRequest } from '@pickupvb/domain';

/**
 * Hard cap on accounts purged per invocation. Each purge does several admin
 * writes + a Stripe call + an auth-row delete; the cron runs daily and the work
 * list (requests whose 30-day window just elapsed) is tiny, so a generous cap
 * keeps a run well inside `maxDuration` while never realistically deferring work.
 */
export const MAX_DELETIONS_PER_RUN = 100;

export interface DeletionPort {
  /** `scheduled` requests whose grace window has elapsed. */
  findDue(now: Date, limit: number): Promise<DeletionRequest[]>;
  /** Irreversibly purge the account behind one request (scrub, Stripe, auth
   * delete) and mark it executed. Throws on failure so the sweep can isolate it. */
  execute(request: DeletionRequest): Promise<void>;
}

export type DeletionSweepResult = {
  due: number;
  purged: number;
  failed: number;
};

/**
 * Purge every due request, isolating failures: one account that errors (a Stripe
 * hiccup, a transient DB error) is logged via `onError` and skipped — it stays
 * `scheduled` and the next daily run retries it — without blocking the rest.
 */
export async function runDeletionSweep(
  port: DeletionPort,
  now: Date,
  onError: (request: DeletionRequest, err: unknown) => void,
): Promise<DeletionSweepResult> {
  const due = await port.findDue(now, MAX_DELETIONS_PER_RUN);
  let purged = 0;
  let failed = 0;
  for (const request of due) {
    try {
      await port.execute(request);
      purged += 1;
    } catch (err) {
      failed += 1;
      onError(request, err);
    }
  }
  return { due: due.length, purged, failed };
}
