/**
 * Notification kind registry.
 *
 * Each kind is a string in the form `<category>.<event>[.<state>]`.
 * The category prefix maps to user-facing preference categories so users
 * can opt in/out at a coarser grain than per-kind.
 *
 * To add a new kind:
 *   1. Add the literal to `NotificationKind` below.
 *   2. Add a `NotificationPayloadMap` entry with the data the template needs.
 *   3. Add a template render in `templates.ts`.
 *   4. Optionally extend `KIND_CATEGORY` if a new category is needed.
 *   5. Set the default channels in `KIND_DEFAULT_CHANNELS`.
 */

export type NotificationKind =
  | 'event.signup.confirmed'
  | 'event.waitlist.promoted'
  | 'event.cancelled'
  | 'event.updated'
  | 'event.reminder.24h'
  | 'event.reminder.2h'
  | 'league.match.reminder'
  | 'payment.refunded'
  | 'host.payout.paid'
  | 'host.stripe.action_required'
  | 'social.follow.new'
  | 'event.free_agent.picked_up'
  | 'badge.earned'
  | 'team.invite'
  | 'broadcast.host_message'
  | 'chat.message.received'
  | 'community.claim.pending'
  | 'community.claim.approved'
  | 'community.listing.auto_hidden'
  | 'account.deletion.requested'
  | 'account.deletion.cancelled';

export type NotificationCategory =
  | 'transactional' // never disable-able
  | 'event_reminders'
  | 'waitlist'
  | 'group_activity'
  | 'social'
  | 'host_payouts'
  | 'broadcasts'
  | 'messages'
  | 'marketing';

export type NotificationChannel = 'email' | 'sms' | 'push' | 'in_app';

export const KIND_CATEGORY: Record<NotificationKind, NotificationCategory> = {
  'event.signup.confirmed': 'transactional',
  'event.waitlist.promoted': 'waitlist',
  'event.cancelled': 'transactional',
  'event.updated': 'event_reminders',
  'event.reminder.24h': 'event_reminders',
  'event.reminder.2h': 'event_reminders',
  'league.match.reminder': 'event_reminders',
  'payment.refunded': 'transactional',
  'host.payout.paid': 'host_payouts',
  'host.stripe.action_required': 'transactional',
  'social.follow.new': 'social',
  'event.free_agent.picked_up': 'group_activity',
  'badge.earned': 'social',
  'team.invite': 'group_activity',
  'broadcast.host_message': 'broadcasts',
  'chat.message.received': 'messages',
  // Community-listing claims are actionable account events about content the
  // user submitted/claimed — transactional so they're never silently disabled
  // (the submitter must decide, and a disabled ping + the 7-day auto-approve
  // would otherwise redirect their listing without their knowledge).
  'community.claim.pending': 'transactional',
  'community.claim.approved': 'transactional',
  // The submitter's listing was auto-hidden by reports — a moderation action on
  // their own content they must be told about (it's the only signal; auto-hide
  // is otherwise silent) and can act on (unhide). Transactional so it's never
  // disabled away.
  'community.listing.auto_hidden': 'transactional',
  'account.deletion.requested': 'transactional',
  'account.deletion.cancelled': 'transactional',
};

/** Default channels for each kind. Per-user prefs further filter this set. */
export const KIND_DEFAULT_CHANNELS: Record<NotificationKind, NotificationChannel[]> = {
  'event.signup.confirmed': ['email', 'push', 'in_app'],
  'event.waitlist.promoted': ['email', 'push', 'in_app'],
  'event.cancelled': ['email', 'push', 'in_app'],
  'event.updated': ['email', 'push', 'in_app'],
  'event.reminder.24h': ['email', 'push', 'in_app'],
  'event.reminder.2h': ['email', 'push', 'in_app'],
  'league.match.reminder': ['email', 'push', 'in_app'],
  'payment.refunded': ['email', 'in_app'],
  'host.payout.paid': ['email', 'in_app'],
  'host.stripe.action_required': ['email', 'in_app'],
  'social.follow.new': ['in_app'],
  'event.free_agent.picked_up': ['email', 'push', 'in_app'],
  'badge.earned': ['in_app'],
  'team.invite': ['email', 'push', 'in_app'],
  'broadcast.host_message': ['email', 'push', 'in_app'],
  // Chat pings are push + bell only — no email (a DM isn't an email-worthy
  // event); the dispatch site coalesces a back-and-forth so a thread doesn't
  // spam. See lib/notify-chat.ts.
  'chat.message.received': ['push', 'in_app'],
  // Submitter gets an email + bell to review; the claimant's approval ping is
  // bell-only (informational, no email-worthy action).
  'community.claim.pending': ['email', 'in_app'],
  'community.claim.approved': ['in_app'],
  // Email + bell so the submitter actually sees it — the listing has already
  // dropped off the public feed, so the bell alone could go unnoticed.
  'community.listing.auto_hidden': ['email', 'in_app'],
  'account.deletion.requested': ['email', 'in_app'],
  'account.deletion.cancelled': ['email', 'in_app'],
};

/** Categories that cannot be disabled by user preference. */
export const TRANSACTIONAL_CATEGORIES: ReadonlySet<NotificationCategory> = new Set([
  'transactional',
]);

// ─── Payload contracts ─────────────────────────────────────────────────
// One entry per kind. The dispatch function is generic over `K` so callers
// get a type-safe payload at every trigger site.

export type NotificationPayloadMap = {
  'event.signup.confirmed': {
    eventId: string;
    eventTitle: string;
    startsAt: string; // ISO
    location: string;
  };
  'event.waitlist.promoted': {
    eventId: string;
    eventTitle: string;
    startsAt: string;
  };
  'event.cancelled': {
    eventId: string;
    eventTitle: string;
    startsAt: string;
    reason: string | null;
  };
  'event.updated': {
    eventId: string;
    eventTitle: string;
    changeSummary: string;
  };
  'event.reminder.24h': {
    eventId: string;
    eventTitle: string;
    startsAt: string;
    location: string;
  };
  'event.reminder.2h': {
    eventId: string;
    eventTitle: string;
    startsAt: string;
    location: string;
  };
  'league.match.reminder': {
    eventId: string;
    eventTitle: string;
    /** The recipient's opponent in this fixture. */
    opponentName: string;
    /** ISO kickoff time. */
    scheduledAt: string;
    /** Court label, when the host set one. */
    courtLabel: string | null;
  };
  'payment.refunded': {
    eventId: string;
    eventTitle: string;
    amountCents: number;
  };
  'host.payout.paid': {
    amountCents: number;
    arrivalDate: string;
  };
  'host.stripe.action_required': {
    message: string;
  };
  'social.follow.new': {
    followerId: string;
    followerName: string;
  };
  'event.free_agent.picked_up': {
    /** Event the free-agent pool belonged to (context in the message). */
    eventTitle: string;
    teamName: string;
    /** Team slug — drives the href to accept the resulting roster invite. */
    teamSlug: string;
    /** Display name of the captain who picked them up. */
    captainName: string;
  };
  'badge.earned': {
    /** Display title of the badge earned (e.g. "Champion", "Summer Slam 2026"). */
    badgeTitle: string;
  };
  'team.invite': {
    teamSlug: string;
    groupName: string;
    inviterName: string;
  };
  'broadcast.host_message': {
    eventId?: string;
    groupId?: string;
    subject: string;
    body: string;
    senderName: string;
  };
  'chat.message.received': {
    /** Conversation the message landed in (drives the thread href). */
    conversationId: string;
    senderId: string;
    senderName: string;
    /** Short, already-truncated message preview (or a placeholder for images). */
    preview: string;
  };
  'community.claim.pending': {
    /** Slug of the listing the claim targets (drives the review href). */
    listingSlug: string;
    listingTitle: string;
    /** Display name of the host who filed the claim. */
    claimantName: string;
  };
  'community.claim.approved': {
    listingSlug: string;
    listingTitle: string;
  };
  'community.listing.auto_hidden': {
    /** Slug of the hidden listing (drives the review/unhide href). */
    listingSlug: string;
    listingTitle: string;
    /** How many reports the listing had when it was hidden. */
    reportCount: number;
  };
  'account.deletion.requested': {
    /** ISO date the account is scheduled to be permanently deleted. */
    scheduledFor: string;
  };
  'account.deletion.cancelled': Record<string, never>;
};

export type NotificationPayload<K extends NotificationKind> = NotificationPayloadMap[K];
