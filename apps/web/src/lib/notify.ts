/**
 * Notification dispatch service. Single entry point for triggers.
 *
 *   await notify('event.signup.confirmed', userId, { eventId, ... });
 *
 * What it does:
 *   1. Loads the recipient's notification_preferences (default-on for email
 *      and in_app, default-off for sms/push).
 *   2. Computes the channels to deliver on, intersecting the kind's
 *      defaults with the user's prefs. Transactional kinds bypass prefs.
 *   3. For `in_app`, inserts directly into `notifications` — Realtime
 *      pushes to subscribers.
 *   4. For `email`/`sms`/`push`, inserts a row into `notification_outbox`.
 *      The cron worker (`/api/notifications/worker`) drains it.
 *
 * Errors never throw — dispatch is best-effort. We log + swallow so a
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
import { createSupabaseAdminClient } from '@pickupvb/supabase';
import { log } from '@/lib/log';

type Prefs = {
    email_enabled: boolean;
    sms_enabled: boolean;
    push_enabled: boolean;
    in_app_enabled: boolean;
    sms_phone: string | null;
    sms_opted_out_at: string | null;
    channel_overrides: Record<string, Partial<Record<NotificationChannel, boolean>>>;
};

type UserRow = { email: string | null };

function channelAllowedByPrefs(
    channel: NotificationChannel,
    kind: NotificationKind,
    prefs: Prefs | null,
): boolean {
    // Transactional kinds always go out (CAN-SPAM allows this).
    if (TRANSACTIONAL_CATEGORIES.has(KIND_CATEGORY[kind])) return true;
    if (!prefs) {
        // No prefs row yet → email + in_app default on, sms/push off.
        return channel === 'email' || channel === 'in_app';
    }
    const masterEnabled =
        channel === 'email'
            ? prefs.email_enabled
            : channel === 'sms'
                ? prefs.sms_enabled && !prefs.sms_opted_out_at && Boolean(prefs.sms_phone)
                : channel === 'push'
                    ? prefs.push_enabled
                    : prefs.in_app_enabled;
    if (!masterEnabled) return false;

    const category = KIND_CATEGORY[kind];
    const override = prefs.channel_overrides?.[category]?.[channel];
    return override !== false;
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
        const admin = createSupabaseAdminClient();

        // Load prefs + user email in parallel.
        const [{ data: prefsRow }, { data: userData, error: userErr }] = await Promise.all([
            admin
                .from('notification_preferences')
                .select(
                    'email_enabled, sms_enabled, push_enabled, in_app_enabled, sms_phone, sms_opted_out_at, channel_overrides',
                )
                .eq('user_id', userId)
                .maybeSingle(),
            admin.auth.admin.getUserById(userId),
        ]);
        const prefs = (prefsRow as unknown as Prefs | null) ?? null;
        const email = userErr ? null : ((userData?.user as UserRow | null)?.email ?? null);

        const desired = KIND_DEFAULT_CHANNELS[kind];
        const channels = desired.filter((c) => channelAllowedByPrefs(c, kind, prefs));

        for (const channel of channels) {
            switch (channel) {
                case 'in_app': {
                    const r = renderInApp(kind, payload);
                    await admin.from('notifications').insert({
                        user_id: userId,
                        kind,
                        title: r.title,
                        body: r.body,
                        href: r.href,
                        data: payload as unknown as Record<string, unknown>,
                    } as never);
                    break;
                }
                case 'email': {
                    if (!email) break;
                    const r = renderEmail(kind, payload);
                    await admin.from('notification_outbox').insert({
                        user_id: userId,
                        channel: 'email',
                        kind,
                        to_address: email,
                        payload: { subject: r.subject, html: r.html, text: r.text },
                        ...(opts.idempotencyKey
                            ? { idempotency_key: `email:${kind}:${opts.idempotencyKey}` }
                            : {}),
                    } as never);
                    break;
                }
                case 'sms': {
                    const phone = prefs?.sms_phone;
                    if (!phone) break;
                    const r = renderSms(kind, payload);
                    await admin.from('notification_outbox').insert({
                        user_id: userId,
                        channel: 'sms',
                        kind,
                        to_address: phone,
                        payload: { body: r.body },
                        ...(opts.idempotencyKey
                            ? { idempotency_key: `sms:${kind}:${opts.idempotencyKey}` }
                            : {}),
                    } as never);
                    break;
                }
                case 'push': {
                    // Web push not wired yet. Skip silently.
                    break;
                }
            }
        }
    } catch (err) {
        // Best-effort: log and swallow so the caller's mutation succeeds.
        await log.warn('[notify] dispatch failed', {
            kind,
            userId,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}
