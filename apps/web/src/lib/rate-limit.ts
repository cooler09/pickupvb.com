import 'server-only';

import { headers } from 'next/headers';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { log } from '@/lib/log';

/**
 * Fixed-window rate limiter backed by the `public.rate_limits` table and
 * the `consume_rate_limit()` SQL function (see migration
 * 20260610000000_rate_limits.sql).
 *
 * Used to throttle email-sending paths (claim flow, guest signup, guest
 * checkout) so an attacker can't replay the form to mail-bomb a target.
 *
 * Backend choice: Postgres rather than Vercel KV / Upstash. Supabase is
 * already on the critical path and the SQL function makes the
 * increment-or-reset atomic. If write contention ever shows up, swap the
 * implementation behind `consumeRateLimit()` without touching call sites.
 *
 * Fail-open: if the DB call errors (network blip, Supabase outage) we
 * allow the request and log a warning. The alternative (locking everyone
 * out on infra failure) is strictly worse from a user-experience
 * perspective and doesn't help the abuse case any more than catching it
 * 99% of the time already does.
 */

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimitOptions {
  /** Stable key. Combine the route + dimension (ip / email) at the call site. */
  key: string;
  /** Max events permitted within the window. */
  limit: number;
  /** Window length, in seconds. */
  windowSeconds: number;
}

export async function consumeRateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  const admin = getAdminSupabase();
  // The `consume_rate_limit` function is added by migration
  // 20260610000000_rate_limits.sql. Until that runs locally and
  // `pnpm --filter @pickupvb/supabase gen:types` regenerates
  // database.types.ts, the function isn't in the typed RPC union, so we
  // cast the rpc handle. The cast goes away after the next type regen.
  type RpcRow = { allowed: boolean; retry_after_seconds: number };
  type RpcArgs = { p_key: string; p_limit: number; p_window_seconds: number };
  const rpc = admin.rpc as unknown as (
    fn: 'consume_rate_limit',
    args: RpcArgs,
  ) => Promise<{ data: RpcRow[] | RpcRow | null; error: { message: string } | null }>;
  try {
    const { data, error } = await rpc('consume_rate_limit', {
      p_key: opts.key,
      p_limit: opts.limit,
      p_window_seconds: opts.windowSeconds,
    });
    if (error || !data) {
      if (error) {
        log.warn('[rate-limit] consume_rate_limit failed; failing open', {
          key: opts.key,
          error: error.message,
        });
      }
      return { allowed: true, retryAfterSeconds: 0 };
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { allowed: true, retryAfterSeconds: 0 };
    return {
      allowed: row.allowed !== false,
      retryAfterSeconds: row.retry_after_seconds ?? 0,
    };
  } catch (err) {
    log.warn('[rate-limit] consume_rate_limit threw; failing open', {
      key: opts.key,
      error: err instanceof Error ? err.message : String(err),
    });
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

/**
 * Best-effort client IP from request headers. Vercel sets
 * `x-forwarded-for` to the comma-separated chain; the first entry is the
 * original client. Falls back to `x-real-ip`, then a literal `'unknown'`
 * sentinel so the limiter key is still stable across requests with no
 * resolvable address.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = h.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}
