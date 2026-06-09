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
 */

type AuditRow = {
  id: string;
  event_id: string;
  user_id: string | null;
  action: 'paid' | 'refunded';
  amount_cents: number;
  payment_intent_id: string | null;
  off_platform: boolean;
  occurred_at: string;
  events: { title: string; starts_at: string } | null;
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
export type ClubMonthAgg = { key: string; label: string; gross: number; net: number };

export type ClubDashboardModel = {
  eventsHosted: number;
  upcoming: number;
  past: number;
  totalAttendees: number;
  feeRate: number;
  allTimeTotals: ClubTotals;
  ytdTotals: ClubTotals;
  events: ClubEventAgg[];
  months: ClubMonthAgg[];
  hasEarnings: boolean;
};

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
  const { data: rawRows } = await admin
    .from('event_payment_audit')
    .select(
      'id, event_id, user_id, action, amount_cents, payment_intent_id, off_platform, occurred_at, events:events!inner(title, starts_at, payout_group_id)',
    )
    .eq('events.payout_group_id', groupId)
    .in('category', ['ticket', 'tip', 'team'])
    .order('occurred_at', { ascending: false });
  const rows = (rawRows as unknown as AuditRow[] | null) ?? [];

  const txns = groupAuditRowsByPaymentIntent(rows, (r) =>
    r.events
      ? { eventId: r.event_id, eventTitle: r.events.title, eventStartsAt: r.events.starts_at }
      : null,
  ).sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));

  const currentYear = new Date().getFullYear();
  const ytd = txns.filter((t) => new Date(t.paidAt).getFullYear() === currentYear);

  function totals(
    ts: ReadonlyArray<{ paidCents: number; refundedCents: number; offPlatform: boolean }>,
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

  const allTimeTotals = totals(txns);
  const ytdTotals = totals(ytd);

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

  const byMonth = new Map<string, ClubMonthAgg>();
  for (const t of ytd) {
    const d = new Date(t.paidAt);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    const m = byMonth.get(key);
    if (m) {
      m.gross += t.paidCents;
      m.net += t.paidCents - t.refundedCents;
    } else {
      byMonth.set(key, { key, label, gross: t.paidCents, net: t.paidCents - t.refundedCents });
    }
  }
  const months = Array.from(byMonth.values()).sort((a, b) => (a.key < b.key ? 1 : -1));

  return {
    eventsHosted,
    upcoming,
    past,
    totalAttendees,
    feeRate,
    allTimeTotals,
    ytdTotals,
    events,
    months,
    hasEarnings: txns.length > 0,
  };
}
