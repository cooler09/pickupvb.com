import 'server-only';

import { consumeRateLimit, rateLimitKey } from '@/lib/rate-limit';
import { isUnprovenHost } from '@/lib/host-account-age';
import { log } from '@/lib/log';

/**
 * Fraud detection signals — the "how do we find out next time" half of the
 * 2026-09 card-testing response (`.scratch/tip-fraud-response/`).
 *
 * That incident was discovered because **Stripe started flagging accounts**:
 * the platform learned about its own fraud from a third party, hours after
 * $811 had moved. Every other control in that bundle reduces the chance of a
 * next time; this module reduces its **duration**.
 *
 * Design notes:
 *
 * - **Counters reuse `rate_limits`.** A fixed-window limiter is already an
 *   atomic counter, so "have we seen N of these in an hour" needs no new table
 *   and no migration. Crossing the limit *is* the signal.
 * - **Every alert is deduped** by a second limiter (`limit: 1`), so a sustained
 *   attack produces one alert per subject per hour rather than one per event.
 *   A fraud alert nobody reads is not detection.
 * - **`log.error`, not `log.warn`.** Errors become Sentry *exceptions* (alertable,
 *   and awaited so they survive the serverless freeze); warnings are messages
 *   that are easy to lose in noise.
 * - **Never throws.** These run inside webhooks and server actions whose real
 *   work must not fail because telemetry did.
 */

/**
 * Declined charges against a single event, per hour, before we shout.
 *
 * Calibration: the attack produced 110 declines — bursts of ~45/hour against one
 * event. A real open play with a dozen signups sees one or two declines all
 * week. Eight is far above normal and far below the attack.
 */
export const DECLINE_BURST_PER_EVENT_PER_HOUR = 8;

/**
 * Events an unproven host may create per day before we shout.
 *
 * This is the gap ticket 07 deliberately left open: the per-event checkout cap
 * is evaded by creating a fresh event each hour. A counter cannot close that —
 * legitimate hosts do create multiple events — but three in a day from an
 * account less than a week old is worth a human look.
 */
export const NEW_HOST_EVENTS_PER_DAY = 3;

/** One alert per (kind, subject) per hour. Returns false when already alerted. */
async function claimAlertSlot(kind: string, subject: string): Promise<boolean> {
  const gate = await consumeRateLimit({
    key: rateLimitKey(`fraud-alert:${kind}`, 'user', subject),
    limit: 1,
    windowSeconds: 3600,
  });
  return gate.allowed;
}

/**
 * Record one declined charge against an event and alert if the rate crosses
 * {@link DECLINE_BURST_PER_EVENT_PER_HOUR}.
 *
 * Declines are the **earliest** signal available: in the reference incident 110
 * of 194 attempts were declined, and they arrive before the successes because
 * the operator is working through a list of mostly-dead cards. Detecting on
 * successes alone means detecting after the money has already moved.
 */
export async function recordCardDecline(eventId: string): Promise<void> {
  try {
    const counter = await consumeRateLimit({
      key: rateLimitKey('decline-burst', 'user', eventId),
      limit: DECLINE_BURST_PER_EVENT_PER_HOUR,
      windowSeconds: 3600,
    });
    if (counter.allowed) return; // still under the threshold
    if (!(await claimAlertSlot('decline-burst', eventId))) return;

    await log.error(
      '[fraud] card-decline burst on a single event',
      new Error('Card-decline burst — possible card testing'),
      {
        eventId,
        threshold: DECLINE_BURST_PER_EVENT_PER_HOUR,
        windowHours: 1,
        action:
          'Review the event and its host; consider un-publishing it and rejecting the Connect account.',
      },
    );
  } catch {
    // Telemetry must never fail the webhook.
  }
}

/**
 * Record an event creation by an unproven host and alert past
 * {@link NEW_HOST_EVENTS_PER_DAY}.
 *
 * Closes the hole named in ticket 07: per-event checkout caps are sidestepped by
 * spinning up a new event per hour, and this is the cheapest place to notice
 * that — it fires on *creation*, before a single card is touched.
 */
export async function recordNewHostEventCreated(input: {
  hostId: string;
  eventId: string;
}): Promise<void> {
  try {
    // Only unproven hosts. An established organizer scheduling a week of open
    // plays in one sitting is normal and must not page anyone.
    if (!(await isUnprovenHost(input.hostId))) return;

    const counter = await consumeRateLimit({
      key: rateLimitKey('new-host-event-create', 'user', input.hostId),
      limit: NEW_HOST_EVENTS_PER_DAY,
      windowSeconds: 86_400,
    });
    if (counter.allowed) return;
    if (!(await claimAlertSlot('new-host-event-create', input.hostId))) return;

    await log.error(
      '[fraud] unproven host is creating events rapidly',
      new Error('New-host event-creation velocity'),
      {
        hostId: input.hostId,
        eventId: input.eventId,
        threshold: NEW_HOST_EVENTS_PER_DAY,
        windowHours: 24,
        action:
          'Check whether the events describe the wrong sport or lack a venue — the 2026-09 signature.',
      },
    );
  } catch {
    // Never fail event creation because telemetry did.
  }
}

/**
 * The per-event checkout cap in `new-host-limits.ts` actually bit.
 *
 * This is the highest-precision signal of the three: the caps sit an order of
 * magnitude above organic demand, so tripping one is close to a positive
 * identification rather than a hint.
 */
export async function recordNewHostCapHit(input: {
  eventId: string;
  hostId: string;
}): Promise<void> {
  try {
    if (!(await claimAlertSlot('new-host-cap', input.eventId))) return;
    await log.error(
      '[fraud] unproven-host checkout cap tripped',
      new Error('New-host per-event checkout cap tripped'),
      {
        eventId: input.eventId,
        hostId: input.hostId,
        action: 'Caps sit far above organic demand — treat as probable abuse, not a busy event.',
      },
    );
  } catch {
    // Never fail the checkout because telemetry did.
  }
}
