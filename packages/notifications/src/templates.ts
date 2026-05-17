/**
 * Template registry: one render per `NotificationKind` per output shape.
 *
 * Returns `RenderedEmail`, `RenderedSms`, or `RenderedInApp` depending on
 * the channel. Each is a small, vendor-agnostic value object.
 *
 * Why hand-rolled HTML instead of React Email? Keeps the package free of
 * runtime React + JSX tooling, builds in <1s, and the markup is simple
 * enough that the readability win from React Email isn't worth the
 * dependency weight yet. Swap-in later is a single-file change.
 */
import {
    type NotificationKind,
    type NotificationPayload,
    type NotificationPayloadMap,
} from './kinds.js';

export type RenderedEmail = {
    subject: string;
    html: string;
    text: string;
};

export type RenderedSms = {
    body: string; // <=160 chars ideal; <=1600 hard cap
};

export type RenderedInApp = {
    title: string;
    body: string | null;
    href: string | null;
};

const APP_URL = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://pickupvb.com';

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatStart(iso: string): string {
    try {
        return new Date(iso).toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    } catch {
        return iso;
    }
}

function formatUsd(cents: number): string {
    const sign = cents < 0 ? '-' : '';
    return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function layout(body: string, ctaUrl?: string, ctaLabel?: string): string {
    const cta = ctaUrl
        ? `<p style="margin:24px 0"><a href="${escapeHtml(ctaUrl)}" style="background:#e6004a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">${escapeHtml(ctaLabel ?? 'View')}</a></p>`
        : '';
    return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a;background:#f7f7f7;margin:0;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;border:1px solid #e5e5e5">
    <div style="font-size:20px;font-weight:700;color:#e6004a;margin-bottom:16px">PickupVB</div>
    ${body}
    ${cta}
    <hr style="border:0;border-top:1px solid #eee;margin:24px 0">
    <p style="font-size:12px;color:#888">
      You're receiving this because of activity in your PickupVB account.
      <a href="${APP_URL}/profile/notifications" style="color:#888">Manage notifications</a>.
    </p>
  </div>
</body></html>`;
}

// ─── Email renderers ───────────────────────────────────────────────────

type EmailRenderer<K extends NotificationKind> = (
    p: NotificationPayloadMap[K],
) => RenderedEmail;

const emailRenderers: { [K in NotificationKind]: EmailRenderer<K> } = {
    'event.signup.confirmed': (p) => ({
        subject: `You're in! ${p.eventTitle}`,
        text: `You're signed up for ${p.eventTitle} on ${formatStart(p.startsAt)} at ${p.location}. ${APP_URL}/events/${p.eventId}`,
        html: layout(
            `<h2 style="margin:0 0 12px">You're in! ${escapeHtml(p.eventTitle)}</h2>
             <p>${escapeHtml(formatStart(p.startsAt))}<br>${escapeHtml(p.location)}</p>
             <p>Add it to your calendar and we'll send a reminder before it starts.</p>`,
            `${APP_URL}/events/${p.eventId}`,
            'View event',
        ),
    }),
    'event.waitlist.promoted': (p) => ({
        subject: `A spot opened up — ${p.eventTitle}`,
        text: `A spot opened up for ${p.eventTitle} on ${formatStart(p.startsAt)}. You're now confirmed. ${APP_URL}/events/${p.eventId}`,
        html: layout(
            `<h2 style="margin:0 0 12px">You're off the waitlist!</h2>
             <p>A spot opened up for <strong>${escapeHtml(p.eventTitle)}</strong> on ${escapeHtml(formatStart(p.startsAt))}. You're now confirmed.</p>`,
            `${APP_URL}/events/${p.eventId}`,
            'View event',
        ),
    }),
    'event.cancelled': (p) => ({
        subject: `Cancelled: ${p.eventTitle}`,
        text: `${p.eventTitle} on ${formatStart(p.startsAt)} has been cancelled.${p.reason ? ` Reason: ${p.reason}` : ''}`,
        html: layout(
            `<h2 style="margin:0 0 12px">Event cancelled</h2>
             <p><strong>${escapeHtml(p.eventTitle)}</strong> on ${escapeHtml(formatStart(p.startsAt))} has been cancelled.</p>
             ${p.reason ? `<p>Reason: ${escapeHtml(p.reason)}</p>` : ''}
             <p>Any paid signups will be refunded automatically.</p>`,
            `${APP_URL}/events/${p.eventId}`,
            'View event',
        ),
    }),
    'event.updated': (p) => ({
        subject: `Updated: ${p.eventTitle}`,
        text: `The host updated ${p.eventTitle}: ${p.changeSummary}. ${APP_URL}/events/${p.eventId}`,
        html: layout(
            `<h2 style="margin:0 0 12px">${escapeHtml(p.eventTitle)} was updated</h2>
             <p>${escapeHtml(p.changeSummary)}</p>`,
            `${APP_URL}/events/${p.eventId}`,
            'View event',
        ),
    }),
    'event.reminder.24h': (p) => ({
        subject: `Tomorrow: ${p.eventTitle}`,
        text: `Reminder: ${p.eventTitle} is tomorrow at ${formatStart(p.startsAt)} — ${p.location}. ${APP_URL}/events/${p.eventId}`,
        html: layout(
            `<h2 style="margin:0 0 12px">See you tomorrow</h2>
             <p><strong>${escapeHtml(p.eventTitle)}</strong><br>
             ${escapeHtml(formatStart(p.startsAt))}<br>
             ${escapeHtml(p.location)}</p>`,
            `${APP_URL}/events/${p.eventId}`,
            'View event',
        ),
    }),
    'event.reminder.2h': (p) => ({
        subject: `Starting soon: ${p.eventTitle}`,
        text: `${p.eventTitle} starts at ${formatStart(p.startsAt)} — ${p.location}.`,
        html: layout(
            `<h2 style="margin:0 0 12px">Starting soon</h2>
             <p><strong>${escapeHtml(p.eventTitle)}</strong><br>
             ${escapeHtml(formatStart(p.startsAt))}<br>
             ${escapeHtml(p.location)}</p>`,
            `${APP_URL}/events/${p.eventId}`,
            'Get directions',
        ),
    }),
    'payment.refunded': (p) => ({
        subject: `Refunded: ${formatUsd(p.amountCents)} for ${p.eventTitle}`,
        text: `Your payment of ${formatUsd(p.amountCents)} for ${p.eventTitle} was refunded.`,
        html: layout(
            `<h2 style="margin:0 0 12px">Refund processed</h2>
             <p>We refunded <strong>${escapeHtml(formatUsd(p.amountCents))}</strong> for ${escapeHtml(p.eventTitle)}. It should appear on your statement in 5–10 business days.</p>`,
            `${APP_URL}/profile/receipts`,
            'View receipts',
        ),
    }),
    'host.payout.paid': (p) => ({
        subject: `Payout sent: ${formatUsd(p.amountCents)}`,
        text: `Stripe sent a payout of ${formatUsd(p.amountCents)} to your bank, arriving ${p.arrivalDate}.`,
        html: layout(
            `<h2 style="margin:0 0 12px">Payout on the way</h2>
             <p>Stripe sent <strong>${escapeHtml(formatUsd(p.amountCents))}</strong> to your linked bank account. Expected arrival: ${escapeHtml(p.arrivalDate)}.</p>`,
            `${APP_URL}/profile/billing/earnings`,
            'View earnings',
        ),
    }),
    'host.stripe.action_required': (p) => ({
        subject: `Action required: Stripe account`,
        text: `Stripe needs more info: ${p.message}. Open ${APP_URL}/profile/billing to fix it.`,
        html: layout(
            `<h2 style="margin:0 0 12px">Stripe needs your attention</h2>
             <p>${escapeHtml(p.message)}</p>`,
            `${APP_URL}/profile/billing`,
            'Open Stripe',
        ),
    }),
    'social.follow.new': (p) => ({
        subject: `${p.followerName} started following you`,
        text: `${p.followerName} started following you on PickupVB.`,
        html: layout(
            `<h2 style="margin:0 0 12px">New follower</h2>
             <p><strong>${escapeHtml(p.followerName)}</strong> started following you on PickupVB.</p>`,
            `${APP_URL}/players/${p.followerId}`,
            'View profile',
        ),
    }),
    'team.invite': (p) => ({
        subject: `${p.inviterName} invited you to ${p.groupName}`,
        text: `${p.inviterName} invited you to join ${p.groupName} on PickupVB.`,
        html: layout(
            `<h2 style="margin:0 0 12px">You're invited to ${escapeHtml(p.groupName)}</h2>
             <p><strong>${escapeHtml(p.inviterName)}</strong> invited you to join.</p>`,
            `${APP_URL}/teams/${p.teamSlug}`,
            'View team',
        ),
    }),
    'broadcast.host_message': (p) => ({
        subject: p.subject,
        text: `${p.body}\n\n— ${p.senderName}`,
        html: layout(
            `<h2 style="margin:0 0 12px">${escapeHtml(p.subject)}</h2>
             <div style="white-space:pre-wrap">${escapeHtml(p.body)}</div>
             <p style="color:#888;margin-top:16px">— ${escapeHtml(p.senderName)}</p>`,
            p.eventId
                ? `${APP_URL}/events/${p.eventId}`
                : p.groupId
                    ? `${APP_URL}/groups/${p.groupId}`
                    : APP_URL,
            'Open in PickupVB',
        ),
    }),
};

// ─── SMS renderers ─────────────────────────────────────────────────────
// SMS is plain text only. Keep <160 chars when possible. End with STOP info
// on first-touch kinds (Twilio appends this automatically for 10DLC).

type SmsRenderer<K extends NotificationKind> = (p: NotificationPayloadMap[K]) => RenderedSms;

const smsRenderers: { [K in NotificationKind]: SmsRenderer<K> } = {
    'event.signup.confirmed': (p) => ({
        body: `PickupVB: You're in for ${p.eventTitle} ${formatStart(p.startsAt)}. ${APP_URL}/events/${p.eventId}`,
    }),
    'event.waitlist.promoted': (p) => ({
        body: `PickupVB: A spot opened for ${p.eventTitle} (${formatStart(p.startsAt)}). You're confirmed. ${APP_URL}/events/${p.eventId}`,
    }),
    'event.cancelled': (p) => ({
        body: `PickupVB: ${p.eventTitle} (${formatStart(p.startsAt)}) was cancelled.${p.reason ? ` ${p.reason}` : ''}`,
    }),
    'event.updated': (p) => ({
        body: `PickupVB: ${p.eventTitle} updated — ${p.changeSummary}. ${APP_URL}/events/${p.eventId}`,
    }),
    'event.reminder.24h': (p) => ({
        body: `PickupVB: ${p.eventTitle} tomorrow at ${formatStart(p.startsAt)}, ${p.location}. ${APP_URL}/events/${p.eventId}`,
    }),
    'event.reminder.2h': (p) => ({
        body: `PickupVB: ${p.eventTitle} starts at ${formatStart(p.startsAt)} — ${p.location}.`,
    }),
    'payment.refunded': (p) => ({
        body: `PickupVB: Refunded ${formatUsd(p.amountCents)} for ${p.eventTitle}.`,
    }),
    'host.payout.paid': (p) => ({
        body: `PickupVB: Stripe sent ${formatUsd(p.amountCents)} to your bank (arrives ${p.arrivalDate}).`,
    }),
    'host.stripe.action_required': (p) => ({
        body: `PickupVB: Stripe needs attention — ${p.message} — ${APP_URL}/profile/billing`,
    }),
    'social.follow.new': (p) => ({
        body: `PickupVB: ${p.followerName} started following you.`,
    }),
    'team.invite': (p) => ({
        body: `PickupVB: ${p.inviterName} invited you to ${p.groupName}. ${APP_URL}/teams/${p.teamSlug}`,
    }),
    'broadcast.host_message': (p) => ({
        body: `PickupVB · ${p.senderName}: ${p.body.slice(0, 240)}`,
    }),
};

// ─── In-app renderers ──────────────────────────────────────────────────

type InAppRenderer<K extends NotificationKind> = (p: NotificationPayloadMap[K]) => RenderedInApp;

const inAppRenderers: { [K in NotificationKind]: InAppRenderer<K> } = {
    'event.signup.confirmed': (p) => ({
        title: `You're in: ${p.eventTitle}`,
        body: `${formatStart(p.startsAt)} · ${p.location}`,
        href: `/events/${p.eventId}`,
    }),
    'event.waitlist.promoted': (p) => ({
        title: `Off the waitlist: ${p.eventTitle}`,
        body: formatStart(p.startsAt),
        href: `/events/${p.eventId}`,
    }),
    'event.cancelled': (p) => ({
        title: `Cancelled: ${p.eventTitle}`,
        body: p.reason ?? null,
        href: `/events/${p.eventId}`,
    }),
    'event.updated': (p) => ({
        title: `${p.eventTitle} updated`,
        body: p.changeSummary,
        href: `/events/${p.eventId}`,
    }),
    'event.reminder.24h': (p) => ({
        title: `Tomorrow: ${p.eventTitle}`,
        body: `${formatStart(p.startsAt)} · ${p.location}`,
        href: `/events/${p.eventId}`,
    }),
    'event.reminder.2h': (p) => ({
        title: `Starting soon: ${p.eventTitle}`,
        body: `${formatStart(p.startsAt)} · ${p.location}`,
        href: `/events/${p.eventId}`,
    }),
    'payment.refunded': (p) => ({
        title: `Refunded ${formatUsd(p.amountCents)}`,
        body: p.eventTitle,
        href: `/profile/receipts`,
    }),
    'host.payout.paid': (p) => ({
        title: `Payout sent: ${formatUsd(p.amountCents)}`,
        body: `Arrives ${p.arrivalDate}`,
        href: `/profile/billing/earnings`,
    }),
    'host.stripe.action_required': (p) => ({
        title: `Stripe needs attention`,
        body: p.message,
        href: `/profile/billing`,
    }),
    'social.follow.new': (p) => ({
        title: `${p.followerName} started following you`,
        body: null,
        href: `/players/${p.followerId}`,
    }),
    'team.invite': (p) => ({
        title: `Invited to ${p.groupName}`,
        body: `from ${p.inviterName}`,
        href: `/teams/${p.teamSlug}`,
    }),
    'broadcast.host_message': (p) => ({
        title: p.subject,
        body: p.body.slice(0, 200),
        href: p.eventId
            ? `/events/${p.eventId}`
            : p.groupId
                ? `/groups/${p.groupId}`
                : '/',
    }),
};

export function renderEmail<K extends NotificationKind>(
    kind: K,
    payload: NotificationPayload<K>,
): RenderedEmail {
    return emailRenderers[kind](payload);
}

export function renderSms<K extends NotificationKind>(
    kind: K,
    payload: NotificationPayload<K>,
): RenderedSms {
    return smsRenderers[kind](payload);
}

export function renderInApp<K extends NotificationKind>(
    kind: K,
    payload: NotificationPayload<K>,
): RenderedInApp {
    return inAppRenderers[kind](payload);
}
