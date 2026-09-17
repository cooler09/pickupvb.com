import 'server-only';

import { consumeRateLimit, rateLimitKey } from '@/lib/rate-limit';
import { isUnprovenHost } from '@/lib/host-account-age';
import { recordNewHostCapHit } from '@/lib/fraud-signals';
import {
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
 * per-buyer key counts to one forever and catches nothing. And deliberately not
 * keyed on IP — the existing 20/hr per-IP guest limit worked correctly and the
 * operator simply rotated IPs.
 */
export async function consumeNewHostChargeLimit(input: {
  eventId: string;
  hostId: string;
  now?: Date;
}): Promise<NewHostLimitResult> {
  const unproven = await isUnprovenHost(input.hostId, input.now ?? new Date());
  if (!unproven) return { allowed: true, retryAfterSeconds: 0 };

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

  // Tripping a cap that sits an order of magnitude above organic demand is a
  // near-positive identification, not a hint — so it raises a real alert rather
  // than a log line nobody reads.
  await recordNewHostCapHit({ eventId: input.eventId, hostId: input.hostId });
  return { allowed: false, retryAfterSeconds: blocked.retryAfterSeconds };
}
