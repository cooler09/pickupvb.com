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

/**
 * Fallback zone when a notification carries no event-specific `timeZone`.
 * Without an explicit `timeZone`, `toLocaleString` formats in the runtime's
 * zone — **UTC on Vercel** — so every "Tomorrow at …" / "Starting soon …" line
 * rendered an hours-off wall-clock for everyone. PickupVB is an East-Coast
 * (Virginia Beach) community, so ET is the right default; per-event zones are
 * threaded through as the optional `tz` arg (notifications audit P2 #8).
 */
const DEFAULT_TIME_ZONE = 'America/New_York';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatStart(iso: string, tz?: string | null): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz || DEFAULT_TIME_ZONE,
    });
  } catch {
    return iso;
  }
}

function formatDate(iso: string, tz?: string | null): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: tz || DEFAULT_TIME_ZONE,
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

type EmailRenderer<K extends NotificationKind> = (p: NotificationPayloadMap[K]) => RenderedEmail;

const emailRenderers: { [K in NotificationKind]: EmailRenderer<K> } = {
  'event.signup.confirmed': (p) => ({
    subject: `You're in! ${p.eventTitle}`,
    text: `You're signed up for ${p.eventTitle} on ${formatStart(p.startsAt, p.timeZone)} at ${p.location}. ${APP_URL}/events/${p.eventId}`,
    html: layout(
      `<h2 style="margin:0 0 12px">You're in! ${escapeHtml(p.eventTitle)}</h2>
             <p>${escapeHtml(formatStart(p.startsAt, p.timeZone))}<br>${escapeHtml(p.location)}</p>
             <p>Add it to your calendar and we'll send a reminder before it starts.</p>`,
      `${APP_URL}/events/${p.eventId}`,
      'View event',
    ),
  }),
  'event.waitlist.promoted': (p) => ({
    subject: `A spot opened up — ${p.eventTitle}`,
    text: `A spot opened up for ${p.eventTitle} on ${formatStart(p.startsAt, p.timeZone)}. You're now confirmed. ${APP_URL}/events/${p.eventId}`,
    html: layout(
      `<h2 style="margin:0 0 12px">You're off the waitlist!</h2>
             <p>A spot opened up for <strong>${escapeHtml(p.eventTitle)}</strong> on ${escapeHtml(formatStart(p.startsAt, p.timeZone))}. You're now confirmed.</p>`,
      `${APP_URL}/events/${p.eventId}`,
      'View event',
    ),
  }),
  'event.cancelled': (p) => ({
    subject: `Cancelled: ${p.eventTitle}`,
    text: `${p.eventTitle} on ${formatStart(p.startsAt, p.timeZone)} has been cancelled.${p.reason ? ` Reason: ${p.reason}` : ''}`,
    html: layout(
      `<h2 style="margin:0 0 12px">Event cancelled</h2>
             <p><strong>${escapeHtml(p.eventTitle)}</strong> on ${escapeHtml(formatStart(p.startsAt, p.timeZone))} has been cancelled.</p>
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
    text: `Reminder: ${p.eventTitle} is tomorrow at ${formatStart(p.startsAt, p.timeZone)} — ${p.location}. ${APP_URL}/events/${p.eventId}`,
    html: layout(
      `<h2 style="margin:0 0 12px">See you tomorrow</h2>
             <p><strong>${escapeHtml(p.eventTitle)}</strong><br>
             ${escapeHtml(formatStart(p.startsAt, p.timeZone))}<br>
             ${escapeHtml(p.location)}</p>`,
      `${APP_URL}/events/${p.eventId}`,
      'View event',
    ),
  }),
  'league.match.reminder': (p) => ({
    subject: `Match tomorrow vs ${p.opponentName}`,
    text: `Reminder: your ${p.eventTitle} match vs ${p.opponentName} is at ${formatStart(p.scheduledAt, p.timeZone)}${p.courtLabel ? ` on ${p.courtLabel}` : ''}. ${APP_URL}/events/${p.eventId}/schedule`,
    html: layout(
      `<h2 style="margin:0 0 12px">Match tomorrow</h2>
             <p><strong>vs ${escapeHtml(p.opponentName)}</strong> · ${escapeHtml(p.eventTitle)}<br>
             ${escapeHtml(formatStart(p.scheduledAt, p.timeZone))}${p.courtLabel ? `<br>${escapeHtml(p.courtLabel)}` : ''}</p>`,
      `${APP_URL}/events/${p.eventId}/schedule`,
      'View schedule',
    ),
  }),
  'event.reminder.2h': (p) => ({
    subject: `Starting soon: ${p.eventTitle}`,
    text: `${p.eventTitle} starts at ${formatStart(p.startsAt, p.timeZone)} — ${p.location}.`,
    html: layout(
      `<h2 style="margin:0 0 12px">Starting soon</h2>
             <p><strong>${escapeHtml(p.eventTitle)}</strong><br>
             ${escapeHtml(formatStart(p.startsAt, p.timeZone))}<br>
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
  // Default channel is in_app only (see KIND_DEFAULT_CHANNELS); the email/sms
  // renderers exist to satisfy the exhaustive Record and never dispatch.
  'badge.earned': (p) => ({
    subject: `You earned the ${p.badgeTitle} badge`,
    text: `You earned the ${p.badgeTitle} badge on PickupVB.`,
    html: layout(
      `<h2 style="margin:0 0 12px">Badge unlocked</h2>
             <p>You earned the <strong>${escapeHtml(p.badgeTitle)}</strong> badge.</p>`,
      `${APP_URL}/profile`,
      'View your badges',
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
  'event.free_agent.picked_up': (p) => ({
    subject: `${p.captainName} picked you up for ${p.teamName}`,
    text: `${p.captainName} picked you up for ${p.teamName} (${p.eventTitle}) on PickupVB. Accept the invite to join the roster.`,
    html: layout(
      `<h2 style="margin:0 0 12px">You've been picked up!</h2>
             <p><strong>${escapeHtml(p.captainName)}</strong> picked you up for <strong>${escapeHtml(p.teamName)}</strong> (${escapeHtml(p.eventTitle)}). Accept the invite to join the roster.</p>`,
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
  // Default channels are push + in_app (see KIND_DEFAULT_CHANNELS); the
  // email/sms renderers exist to satisfy the exhaustive Record and never dispatch.
  'chat.message.received': (p) => ({
    subject: `New message from ${p.senderName}`,
    text: `${p.senderName}: ${p.preview}`,
    html: layout(
      `<h2 style="margin:0 0 12px">New message from ${escapeHtml(p.senderName)}</h2>
             <p>${escapeHtml(p.preview)}</p>`,
      `${APP_URL}/messages/${p.conversationId}`,
      'Open conversation',
    ),
  }),
  'community.claim.pending': (p) => ({
    subject: `Someone claimed your listing: ${p.listingTitle}`,
    text: `${p.claimantName} asked to link your community listing "${p.listingTitle}" to their PickupVB event. Review and approve or reject it: ${APP_URL}/community/${p.listingSlug}`,
    html: layout(
      `<h2 style="margin:0 0 12px">A host claimed your listing</h2>
             <p><strong>${escapeHtml(p.claimantName)}</strong> asked to link your community listing
             <strong>${escapeHtml(p.listingTitle)}</strong> to their PickupVB event.</p>
             <p>Approve it to redirect the listing to their event, or reject it to leave the listing
             as-is. If you don't respond within 7 days, the claim is auto-approved.</p>`,
      `${APP_URL}/community/${p.listingSlug}`,
      'Review claim',
    ),
  }),
  'community.claim.approved': (p) => ({
    subject: `Your claim was approved: ${p.listingTitle}`,
    text: `Your claim on "${p.listingTitle}" was approved — the listing now points to your PickupVB event. ${APP_URL}/community/${p.listingSlug}`,
    html: layout(
      `<h2 style="margin:0 0 12px">Claim approved</h2>
             <p>Your claim on <strong>${escapeHtml(p.listingTitle)}</strong> was approved. The
             listing now points visitors at your PickupVB event.</p>`,
      `${APP_URL}/community/${p.listingSlug}`,
      'View event',
    ),
  }),
  'community.listing.auto_hidden': (p) => ({
    subject: `Your community listing was hidden: ${p.listingTitle}`,
    text: `Your community listing "${p.listingTitle}" was hidden after ${p.reportCount} report${p.reportCount === 1 ? '' : 's'} from other users, so it's no longer visible to the public. If you think that's a mistake, review and unhide it: ${APP_URL}/community/${p.listingSlug}`,
    html: layout(
      `<h2 style="margin:0 0 12px">Your listing was hidden</h2>
             <p>Your community listing <strong>${escapeHtml(p.listingTitle)}</strong> was hidden after
             <strong>${p.reportCount}</strong> report${p.reportCount === 1 ? '' : 's'} from other users, so
             it's no longer visible to the public.</p>
             <p>If you think that's a mistake, review the listing and unhide it.</p>`,
      `${APP_URL}/community/${p.listingSlug}`,
      'Review listing',
    ),
  }),
  'account.deletion.requested': (p) => ({
    subject: 'Your PickupVB account is scheduled for deletion',
    text: `Your PickupVB account is scheduled to be permanently deleted on ${formatDate(p.scheduledFor)}. If you didn't request this — or change your mind — you can cancel any time before then from your profile.`,
    html: layout(
      `<h2 style="margin:0 0 12px">Account deletion scheduled</h2>
             <p>Your PickupVB account is scheduled to be <strong>permanently deleted on ${escapeHtml(formatDate(p.scheduledFor))}</strong>.</p>
             <p>If you didn't request this, or you change your mind, cancel any time before then — nothing is removed until the date above.</p>`,
      `${APP_URL}/profile/account/delete`,
      'Review or cancel',
    ),
  }),
  'account.deletion.cancelled': () => ({
    subject: 'Your PickupVB account deletion was cancelled',
    text: `Good news — the scheduled deletion of your PickupVB account has been cancelled. Your account and data are intact.`,
    html: layout(
      `<h2 style="margin:0 0 12px">Deletion cancelled</h2>
             <p>The scheduled deletion of your PickupVB account has been cancelled. Your account and data are intact — welcome back.</p>`,
      `${APP_URL}/profile`,
      'Go to your profile',
    ),
  }),
};

// ─── SMS renderers ─────────────────────────────────────────────────────
// SMS is plain text only. Keep <160 chars when possible. End with STOP info
// on first-touch kinds (Twilio appends this automatically for 10DLC).

type SmsRenderer<K extends NotificationKind> = (p: NotificationPayloadMap[K]) => RenderedSms;

const smsRenderers: { [K in NotificationKind]: SmsRenderer<K> } = {
  'event.signup.confirmed': (p) => ({
    body: `PickupVB: You're in for ${p.eventTitle} ${formatStart(p.startsAt, p.timeZone)}. ${APP_URL}/events/${p.eventId}`,
  }),
  'event.waitlist.promoted': (p) => ({
    body: `PickupVB: A spot opened for ${p.eventTitle} (${formatStart(p.startsAt, p.timeZone)}). You're confirmed. ${APP_URL}/events/${p.eventId}`,
  }),
  'event.cancelled': (p) => ({
    body: `PickupVB: ${p.eventTitle} (${formatStart(p.startsAt, p.timeZone)}) was cancelled.${p.reason ? ` ${p.reason}` : ''}`,
  }),
  'event.updated': (p) => ({
    body: `PickupVB: ${p.eventTitle} updated — ${p.changeSummary}. ${APP_URL}/events/${p.eventId}`,
  }),
  'event.reminder.24h': (p) => ({
    body: `PickupVB: ${p.eventTitle} tomorrow at ${formatStart(p.startsAt, p.timeZone)}, ${p.location}. ${APP_URL}/events/${p.eventId}`,
  }),
  'league.match.reminder': (p) => ({
    body: `PickupVB: match vs ${p.opponentName} (${p.eventTitle}) at ${formatStart(p.scheduledAt, p.timeZone)}${p.courtLabel ? `, ${p.courtLabel}` : ''}. ${APP_URL}/events/${p.eventId}/schedule`,
  }),
  'event.reminder.2h': (p) => ({
    body: `PickupVB: ${p.eventTitle} starts at ${formatStart(p.startsAt, p.timeZone)} — ${p.location}.`,
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
  'badge.earned': (p) => ({
    body: `PickupVB: you earned the ${p.badgeTitle} badge.`,
  }),
  'team.invite': (p) => ({
    body: `PickupVB: ${p.inviterName} invited you to ${p.groupName}. ${APP_URL}/teams/${p.teamSlug}`,
  }),
  'event.free_agent.picked_up': (p) => ({
    body: `PickupVB: ${p.captainName} picked you up for ${p.teamName} (${p.eventTitle}). ${APP_URL}/teams/${p.teamSlug}`,
  }),
  'broadcast.host_message': (p) => ({
    body: `PickupVB · ${p.senderName}: ${p.body.slice(0, 240)}`,
  }),
  'chat.message.received': (p) => ({
    body: `PickupVB · ${p.senderName}: ${p.preview.slice(0, 200)}`,
  }),
  'community.claim.pending': (p) => ({
    body: `PickupVB: ${p.claimantName} claimed your listing "${p.listingTitle}". Review it: ${APP_URL}/community/${p.listingSlug}`,
  }),
  'community.claim.approved': (p) => ({
    body: `PickupVB: your claim on "${p.listingTitle}" was approved. ${APP_URL}/community/${p.listingSlug}`,
  }),
  'community.listing.auto_hidden': (p) => ({
    body: `PickupVB: your listing "${p.listingTitle}" was hidden after ${p.reportCount} reports. Review or unhide: ${APP_URL}/community/${p.listingSlug}`,
  }),
  'account.deletion.requested': (p) => ({
    body: `PickupVB: Your account is scheduled for deletion on ${formatDate(p.scheduledFor)}. Cancel before then: ${APP_URL}/profile/account/delete`,
  }),
  'account.deletion.cancelled': () => ({
    body: `PickupVB: Your account deletion was cancelled. Your account is intact.`,
  }),
};

// ─── In-app renderers ──────────────────────────────────────────────────

type InAppRenderer<K extends NotificationKind> = (p: NotificationPayloadMap[K]) => RenderedInApp;

const inAppRenderers: { [K in NotificationKind]: InAppRenderer<K> } = {
  'event.signup.confirmed': (p) => ({
    title: `You're in: ${p.eventTitle}`,
    body: `${formatStart(p.startsAt, p.timeZone)} · ${p.location}`,
    href: `/events/${p.eventId}`,
  }),
  'event.waitlist.promoted': (p) => ({
    title: `Off the waitlist: ${p.eventTitle}`,
    body: formatStart(p.startsAt, p.timeZone),
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
    body: `${formatStart(p.startsAt, p.timeZone)} · ${p.location}`,
    href: `/events/${p.eventId}`,
  }),
  'league.match.reminder': (p) => ({
    title: `Match vs ${p.opponentName}`,
    body: `${formatStart(p.scheduledAt, p.timeZone)}${p.courtLabel ? ` · ${p.courtLabel}` : ''}`,
    href: `/events/${p.eventId}/schedule`,
  }),
  'event.reminder.2h': (p) => ({
    title: `Starting soon: ${p.eventTitle}`,
    body: `${formatStart(p.startsAt, p.timeZone)} · ${p.location}`,
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
  'badge.earned': (p) => ({
    title: `Badge unlocked: ${p.badgeTitle}`,
    body: null,
    href: `/profile`,
  }),
  'team.invite': (p) => ({
    title: `Invited to ${p.groupName}`,
    body: `from ${p.inviterName}`,
    href: `/teams/${p.teamSlug}`,
  }),
  'event.free_agent.picked_up': (p) => ({
    title: `Picked up for ${p.teamName}`,
    body: `${p.captainName} · ${p.eventTitle}`,
    href: `/teams/${p.teamSlug}`,
  }),
  'broadcast.host_message': (p) => ({
    title: p.subject,
    body: p.body.slice(0, 200),
    href: p.eventId ? `/events/${p.eventId}` : p.groupId ? `/groups/${p.groupId}` : '/',
  }),
  'chat.message.received': (p) => ({
    title: `New message from ${p.senderName}`,
    body: p.preview || null,
    href: `/messages/${p.conversationId}`,
  }),
  'community.claim.pending': (p) => ({
    title: `${p.claimantName} claimed your listing`,
    body: `Review the claim on "${p.listingTitle}"`,
    href: `/community/${p.listingSlug}`,
  }),
  'community.claim.approved': (p) => ({
    title: 'Your listing claim was approved',
    body: `"${p.listingTitle}" now points to your event`,
    href: `/community/${p.listingSlug}`,
  }),
  'community.listing.auto_hidden': (p) => ({
    title: 'Your listing was hidden',
    body: `"${p.listingTitle}" was hidden after ${p.reportCount} report${p.reportCount === 1 ? '' : 's'} — review or unhide it`,
    href: `/community/${p.listingSlug}`,
  }),
  'account.deletion.requested': (p) => ({
    title: 'Account deletion scheduled',
    body: `Permanent on ${formatDate(p.scheduledFor)} · cancel any time before then`,
    href: `/profile/account/delete`,
  }),
  'account.deletion.cancelled': () => ({
    title: 'Account deletion cancelled',
    body: 'Your account and data are intact.',
    href: `/profile`,
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
