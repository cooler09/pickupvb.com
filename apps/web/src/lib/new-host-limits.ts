import 'server-only';

import { getAdminSupabase } from '@/lib/supabase-admin';
import { consumeRateLimit, rateLimitKey } from '@/lib/rate-limit';
import { log } from '@/lib/log';
import {
  isNewHostAccount,
  NEW_HOST_EVENT_CHECKOUTS_PER_HOUR,
  NEW_HOST_EVENT_CHECKOUTS_PER_DAY,
} from '@/lib/new-host-policy';

export interface NewHostLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Gate a checkout on the per-event caps that apply while a host account is
 * unproven. See `new-host-policy.ts` for the reasoning and the calibration.
 *
 * Call this **before** reserving a spot or opening a Checkout Session, from
 * every destination-charge entry point (ticket + tip, authed + guest).
 *
 * Keyed on the **event**, not the buyer: the attack drove 27–30 sessions
 * through a single event using a fresh anonymous buyer identity each time, so a
 * per-buyer key counts to one forever and catches nothing.
 *
 * Reads the host's account age on the **admin client**. That is correct here and
 * not the anti-pattern in AGENTS.md § "Don't enforce authorization on the admin
 * client": this is a platform risk control about a *third party* (the host), not
 * an authorization decision about the caller, and base `profiles` is
 * owner-only under RLS so a session-scoped read would return null for every
 * viewer and cap every event on earth.
 */
export async function consumeNewHostChargeLimit(input: {
  eventId: string;
  hostId: string;
  now?: Date;
}): Promise<NewHostLimitResult> {
  const now = input.now ?? new Date();

  let createdAt: string | null = null;
  try {
    const admin = getAdminSupabase();
    const { data } = await admin
      .from('profiles')
      .select('created_at')
      .eq('id', input.hostId)
      .maybeSingle();
    createdAt = (data as { created_at: string } | null)?.created_at ?? null;
  } catch (err) {
    // Unknown age → isNewHostAccount fails closed → the caps apply. Log so an
    // outage that silently starts throttling every event is visible.
    log.warn('[new-host-limits] host age lookup failed; applying caps', {
      hostId: input.hostId,
      err: String(err),
    });
  }

  if (!isNewHostAccount(createdAt, now)) return { allowed: true, retryAfterSeconds: 0 };

  const [hourly, daily] = await Promise.all([
    consumeRateLimit({
      key: rateLimitKey('new-host-event:hourly', 'user', input.eventId),
      limit: NEW_HOST_EVENT_CHECKOUTS_PER_HOUR,
      windowSeconds: 3600,
    }),
    consumeRateLimit({
      key: rateLimitKey('new-host-event:daily', 'user', input.eventId),
      limit: NEW_HOST_EVENT_CHECKOUTS_PER_DAY,
      windowSeconds: 86_400,
    }),
  ]);

  const blocked = !hourly.allowed ? hourly : !daily.allowed ? daily : null;
  if (!blocked) return { allowed: true, retryAfterSeconds: 0 };

  log.warn('[new-host-limits] capped a checkout on an unproven host', {
    eventId: input.eventId,
    hostId: input.hostId,
    retryAfterSeconds: blocked.retryAfterSeconds,
  });
  return { allowed: false, retryAfterSeconds: blocked.retryAfterSeconds };
}
