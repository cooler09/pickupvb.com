import { timingSafeEqual } from 'node:crypto';

/**
 * Shared authorization for cron / scheduled routes (security audit P2 #13).
 *
 * Vercel Cron attaches `Authorization: Bearer <CRON_SECRET>` automatically when
 * a request's path matches a `crons[].path` entry in `vercel.json`; pg_cron jobs
 * (e.g. `kick_badge_reconcile`) send the same header. Every cron route runs on
 * the **service-role admin client**, so an unauthenticated invocation can fan out
 * email/push, auto-approve listings, or — in the case of `account/execute-deletions`
 * — hard-delete accounts. Authorization here is the only gate.
 *
 * **Fails closed in production.** If `CRON_SECRET` is unset (rotation slip,
 * new-environment bootstrap, typo'd key name), only a non-production runtime may
 * run unauthenticated — the local-dev convenience the previous per-route
 * fallback was reaching for, without leaving the routes world-invokable in prod.
 *
 * The token comparison is constant-time (`timingSafeEqual`) to avoid leaking the
 * secret length/prefix through response-timing, after an equal-length guard
 * (`timingSafeEqual` throws on length mismatch).
 */
export function isCronAuthorized(req: Request): boolean {
  const secret = process.env['CRON_SECRET'];
  if (!secret) {
    // Fail closed in prod; only the local dev fallback may run unauthenticated.
    return process.env['NODE_ENV'] !== 'production';
  }
  const header = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  const headerBuf = Buffer.from(header);
  const expectedBuf = Buffer.from(expected);
  return headerBuf.length === expectedBuf.length && timingSafeEqual(headerBuf, expectedBuf);
}
