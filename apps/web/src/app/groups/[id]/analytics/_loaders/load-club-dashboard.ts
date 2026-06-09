import 'server-only';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { PRO_PLATFORM_FEE_BPS } from '@/lib/pro';
import { groupAuditRowsByPaymentIntent, estimatePlatformFeeCents } from '@/lib/receipts';

/**
 * Club dashboard data (ADR 0038 O-2b/O-2c). Reads on the admin client because a
 * group owner/admin is generally NOT the event host, so the per-host RLS on
 * `event_payment_audit` / participants wouldn't grant them these rows — the
 * page authorizes owner/admin + Club at the app layer before calling this.
 *
 * Two scopes:
 *   - **Engagement (O-2b):** every event the club HOSTS (`events.host_group_id`).
 *   - **Payout income (O-2c):** events that PAID OUT to the club
 *     (`events.payout_group_id`) — the money the club's Stripe account received.
 *
 * Read shape (perf audit P3 #22): the **all-time money headline** comes from a
 * cheap narrow read (three columns, no `events` join, no order) so it stays
 * correct across the club's full history without materializing every row's join;
 * the **per-event / this-year detail** comes from a separate read bounded to a
 * trailing window (the expensive ordered read no longer grows unbounded). Both
 * audit reads filter on `event_id IN (club's payout events)` rather than joining
 * `events.payout_group_id`, so neither needs the join at all.
 */

const DETAIL_WINDOW_MONTHS = 24;

/** Narrow row for the all-time headline — just enough to sum gross/refunded and
 * the on-platform net that drives the fee estimate. */
type NarrowAuditRow = { action: 'paid' | 'refunded'; amount_cents: number; off_platform: boolean };

/** Windowed detail row — the full {@link import('@/lib/receipts').AuditLedgerRow}
 * shape the payment-intent grouper needs (event title/starts come from the map). */
type DetailAuditRow = {
  id: string;
  event_id: string;
  user_id: string | null;
  action: 'paid' | 'refunded';
  amount_cents: number;
  payment_intent_id: string | null;
  off_platform: boolean;
  occurred_at: string;
};

export type ClubTotals = {
  gross: number;
  refunded: number;
  net: number;
  platformFee: number;
  estPayout: number;
};
export type ClubEventAgg = {
  eventId: string;
  eventTitle: string;
  eventStartsAt: string;
  gross: number;
  refunded: number;
  net: number;
  txnCount: number;
};

export type ClubDashboardModel = {
  eventsHosted: number;
  upcoming: number;
  past: number;
  totalAttendees: number;
  feeRate: number;
  allTimeTotals: ClubTotals;
  ytdTotals: ClubTotals;
  events: ClubEventAgg[];
  hasEarnings: boolean;
  /** Trailing window (months) the per-event table reflects; all-time totals are full history. */
  detailWindowMonths: number;
};

/** All-time totals straight off the narrow rows — payment-intent grouping doesn't
 * change the sums, so we skip it and sum actions directly. */
function sumTotals(rows: readonly NarrowAuditRow[], feeRate: number): ClubTotals {
  let gross = 0;
  let refunded = 0;
  let onPlatformPaid = 0;
  let onPlatformRefunded = 0;
  for (const r of rows) {
    if (r.action === 'paid') {
      gross += r.amount_cents;
      if (!r.off_platform) onPlatformPaid += r.amount_cents;
    } else {
      refunded += r.amount_cents;
      if (!r.off_platform) onPlatformRefunded += r.amount_cents;
    }
  }
  const net = gross - refunded;
  const platformFee = estimatePlatformFeeCents(onPlatformPaid - onPlatformRefunded, feeRate);
  return { gross, refunded, net, platformFee, estPayout: net - platformFee };
}

/** Same totals from grouped transactions (used for the windowed this-year set). */
function totalsFromTxns(
  ts: ReadonlyArray<{ paidCents: number; refundedCents: number; offPlatform: boolean }>,
  feeRate: number,
): ClubTotals {
  const gross = ts.reduce((s, t) => s + t.paidCents, 0);
  const refunded = ts.reduce((s, t) => s + t.refundedCents, 0);
  const net = gross - refunded;
  const onPlatformNet = ts
    .filter((t) => !t.offPlatform)
    .reduce((s, t) => s + (t.paidCents - t.refundedCents), 0);
  const platformFee = estimatePlatformFeeCents(onPlatformNet, feeRate);
  return { gross, refunded, net, platformFee, estPayout: net - platformFee };
}

export async function loadClubDashboard(groupId: string): Promise<ClubDashboardModel> {
  const admin = getAdminSupabase();
  // Club admins get Pro (O-2a), so club-routed events were charged the Pro rate;
  // estimate the platform fee at 2.5% (Stripe's Express dashboard is final word).
  const feeRate = PRO_PLATFORM_FEE_BPS / 10_000;

  // ── Engagement: events the club hosts ──
  const { data: evData } = await admin
    .from('events')
    .select('id, starts_at')
    .eq('host_group_id', groupId);
  const evRows = (evData as { id: string; starts_at: string }[] | null) ?? [];
  const nowIso = new Date().toISOString();
  const eventsHosted = evRows.length;
  const upcoming = evRows.filter((e) => e.starts_at >= nowIso).length;
  const past = eventsHosted - upcoming;

  // Attendees across the club's events (event → divisions → participants).
  let totalAttendees = 0;
  if (evRows.length > 0) {
    const ids = evRows.map((e) => e.id);
    const { data: divData } = await admin.from('event_divisions').select('id').in('event_id', ids);
    const divIds = ((divData as { id: string }[] | null) ?? []).map((d) => d.id);
    if (divIds.length > 0) {
      const { count } = await admin
        .from('event_participants')
        .select('id', { count: 'exact', head: true })
        .in('division_id', divIds)
        .eq('role', 'attendee');
      totalAttendees = count ?? 0;
    }
  }

  // ── Payout income: events that paid out to the club ──
  // The club's payout events (small set): gives the event-id filter for the audit
  // reads (no `events` join needed) plus the title/starts map for the per-event table.
  const { data: payoutEvData } = await admin
    .from('events')
    .select('id, title, starts_at')
    .eq('payout_group_id', groupId);
  const payoutEvents =
    (payoutEvData as { id: string; title: string; starts_at: string }[] | null) ?? [];
  const payoutEventIds = payoutEvents.map((e) => e.id);
  const eventMeta = new Map(
    payoutEvents.map((e) => [e.id, { title: e.title, startsAt: e.starts_at }]),
  );

  const zero: ClubTotals = { gross: 0, refunded: 0, net: 0, platformFee: 0, estPayout: 0 };
  if (payoutEventIds.length === 0) {
    return {
      eventsHosted,
      upcoming,
      past,
      totalAttendees,
      feeRate,
      allTimeTotals: zero,
      ytdTotals: zero,
      events: [],
      hasEarnings: false,
      detailWindowMonths: DETAIL_WINDOW_MONTHS,
    };
  }

  // All-time headline — narrow (no join, no order), so it can sum the full history cheaply.
  const { data: allRows } = await admin
    .from('event_payment_audit')
    .select('action, amount_cents, off_platform')
    .in('event_id', payoutEventIds)
    .in('category', ['ticket', 'tip', 'team']);
  const allTimeTotals = sumTotals((allRows as NarrowAuditRow[] | null) ?? [], feeRate);

  // Detail — per-event table + this-year totals, bounded to the trailing window
  // so the ordered read doesn't grow unbounded with the club's history.
  const windowStart = new Date();
  windowStart.setUTCMonth(windowStart.getUTCMonth() - DETAIL_WINDOW_MONTHS);
  const { data: rawRows } = await admin
    .from('event_payment_audit')
    .select(
      'id, event_id, user_id, action, amount_cents, payment_intent_id, off_platform, occurred_at',
    )
    .in('event_id', payoutEventIds)
    .in('category', ['ticket', 'tip', 'team'])
    .gte('occurred_at', windowStart.toISOString())
    .order('occurred_at', { ascending: false });
  const rows = (rawRows as DetailAuditRow[] | null) ?? [];

  const txns = groupAuditRowsByPaymentIntent(rows, (r) => {
    const meta = eventMeta.get(r.event_id);
    return meta
      ? { eventId: r.event_id, eventTitle: meta.title, eventStartsAt: meta.startsAt }
      : null;
  }).sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));

  const currentYear = new Date().getFullYear();
  const ytd = txns.filter((t) => new Date(t.paidAt).getFullYear() === currentYear);
  const ytdTotals = totalsFromTxns(ytd, feeRate);

  const byEvent = new Map<string, ClubEventAgg>();
  for (const t of txns) {
    const e = byEvent.get(t.eventId);
    if (e) {
      e.gross += t.paidCents;
      e.refunded += t.refundedCents;
      e.net = e.gross - e.refunded;
      e.txnCount += 1;
    } else {
      byEvent.set(t.eventId, {
        eventId: t.eventId,
        eventTitle: t.eventTitle,
        eventStartsAt: t.eventStartsAt,
        gross: t.paidCents,
        refunded: t.refundedCents,
        net: t.paidCents - t.refundedCents,
        txnCount: 1,
      });
    }
  }
  const events = Array.from(byEvent.values()).sort((a, b) =>
    a.eventStartsAt < b.eventStartsAt ? 1 : -1,
  );

  return {
    eventsHosted,
    upcoming,
    past,
    totalAttendees,
    feeRate,
    allTimeTotals,
    ytdTotals,
    events,
    hasEarnings: allTimeTotals.gross > 0,
    detailWindowMonths: DETAIL_WINDOW_MONTHS,
  };
}
