/**
 * Notification dispatch service. Single entry point for triggers.
 *
 *   await notify('event.signup.confirmed', userId, { eventId, ... });
 *
 * What it does:
 *   1. Loads the recipient's notification preferences (default-on for email
 *      and in_app, default-off for sms/push) + their email.
 *   2. Computes the channels to deliver on, intersecting the kind's
 *      defaults with the user's prefs. Transactional kinds bypass prefs.
 *   3. For `in_app`, inserts an in-app notification — Realtime pushes it.
 *   4. For `email`/`sms`/`push`, enqueues a `notification_outbox` row.
 *      The cron worker (`/api/notifications/worker`) drains it.
 *
 * The DB writes/reads go through a `NotificationOutboxPort` (ADR 0022) — the
 * `SupabaseNotificationOutboxRepository` runs on the service-role client because
 * dispatch is a session-less fan-out. `dispatch` is exported (and takes the
 * port) so the fan-out behavior is unit-testable.
 *
 * Errors never throw — dispatch is best-effort. `notify` logs + swallows so a
 * notification failure can't break the user's signup flow.
 */
import {
  KIND_CATEGORY,
  KIND_DEFAULT_CHANNELS,
  TRANSACTIONAL_CATEGORIES,
  renderEmail,
  renderInApp,
  renderSms,
  type NotificationChannel,
  type NotificationKind,
  type NotificationPayload,
} from '@pickupvb/notifications';
import type {
  NotificationOutboxPort,
  NotificationPreferences,
  OutboxMessage,
} from '@pickupvb/domain';
import { SupabaseNotificationOutboxRepository } from '@pickupvb/infrastructure';
import { createSupabaseAdminClient } from '@pickupvb/supabase';
import { log } from '@/lib/log';

function channelAllowedByPrefs(
  channel: NotificationChannel,
  kind: NotificationKind,
  prefs: NotificationPreferences | null,
): boolean {
  // Transactional kinds always go out (CAN-SPAM allows this).
  if (TRANSACTIONAL_CATEGORIES.has(KIND_CATEGORY[kind])) return true;
  if (!prefs) {
    // No prefs row yet → email + in_app default on, sms/push off.
    return channel === 'email' || channel === 'in_app';
  }
  const masterEnabled =
    channel === 'email'
      ? prefs.emailEnabled
      : channel === 'sms'
        ? prefs.smsEnabled && !prefs.smsOptedOutAt && Boolean(prefs.smsPhone)
        : channel === 'push'
          ? prefs.pushEnabled
          : prefs.inAppEnabled;
  if (!masterEnabled) return false;

  const category = KIND_CATEGORY[kind];
  const override = prefs.channelOverrides?.[category]?.[channel];
  return override !== false;
}

/**
 * Fan a notification out to the recipient's enabled channels via the outbox
 * port. Exported (and port-injected) so the channel-selection + fan-out
 * behavior can be tested with a fake port. Throws on a port failure — `notify`
 * wraps it best-effort.
 */
export async function dispatch<K extends NotificationKind>(
  outbox: NotificationOutboxPort,
  kind: K,
  userId: string,
  payload: NotificationPayload<K>,
  opts: { idempotencyKey?: string } = {},
): Promise<void> {
  const [prefs, email] = await Promise.all([
    outbox.loadPreferences(userId),
    outbox.getUserEmail(userId),
  ]);

  const desired = KIND_DEFAULT_CHANNELS[kind];
  const channels = desired.filter((c) => channelAllowedByPrefs(c, kind, prefs));

  // Collect outbox (email/sms/push) messages and flush them in one insert below,
  // so the whole fan-out triggers a single worker kick (ADR 0026). In-app rows
  // go to a different table (Realtime-delivered), so they stay immediate.
  const messages: OutboxMessage[] = [];

  for (const channel of channels) {
    switch (channel) {
      case 'in_app': {
        const r = renderInApp(kind, payload);
        await outbox.insertInApp({
          userId,
          kind,
          title: r.title,
          body: r.body,
          href: r.href,
          data: payload as unknown as Record<string, unknown>,
        });
        break;
      }
      case 'email': {
        if (!email) break;
        const r = renderEmail(kind, payload);
        messages.push({
          userId,
          channel: 'email',
          kind,
          toAddress: email,
          payload: { subject: r.subject, html: r.html, text: r.text },
          ...(opts.idempotencyKey
            ? { idempotencyKey: `email:${kind}:${opts.idempotencyKey}` }
            : {}),
        });
        break;
      }
      case 'sms': {
        const phone = prefs?.smsPhone;
        if (!phone) break;
        const r = renderSms(kind, payload);
        messages.push({
          userId,
          channel: 'sms',
          kind,
          toAddress: phone,
          payload: { body: r.body },
          ...(opts.idempotencyKey ? { idempotencyKey: `sms:${kind}:${opts.idempotencyKey}` } : {}),
        });
        break;
      }
      case 'push': {
        const r = renderInApp(kind, payload);
        messages.push({
          userId,
          channel: 'push',
          kind,
          toAddress: userId,
          payload: { title: r.title, body: r.body, href: r.href, tag: kind },
          ...(opts.idempotencyKey ? { idempotencyKey: `push:${kind}:${opts.idempotencyKey}` } : {}),
        });
        break;
      }
    }
  }

  // One insert for the whole fan-out → one DB kick of the worker (ADR 0026),
  // instead of one per channel. No-op when no channel resolved to an outbox row.
  if (messages.length > 0) await outbox.enqueue(messages);
}

/**
 * Dispatch a notification to a single user across all enabled channels.
 *
 * `idempotencyKey` is recommended when the trigger may fire more than once
 * for the same logical event (e.g. webhook retries). It's per-channel
 * namespaced internally so the same key works across kinds.
 */
export async function notify<K extends NotificationKind>(
  kind: K,
  userId: string,
  payload: NotificationPayload<K>,
  opts: { idempotencyKey?: string } = {},
): Promise<void> {
  try {
    // Session-less fan-out → service-role client (ADR 0022 / pitfall #8).
    const outbox = new SupabaseNotificationOutboxRepository(createSupabaseAdminClient());
    await dispatch(outbox, kind, userId, payload, opts);
  } catch (err) {
    // Best-effort: log and swallow so the caller's mutation succeeds.
    await log.warn('[notify] dispatch failed', {
      kind,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
