import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase';
import { isPro, PRO_PLATFORM_FEE_BPS } from '@/lib/pro';
import { PLATFORM_FEE_BPS } from '@/lib/stripe';
import { groupAuditRowsByPaymentIntent, estimatePlatformFeeCents } from '@/lib/receipts';

export const EVENTS_PER_PAGE = 20;

type AuditRow = {
  id: string;
  event_id: string;
  action: 'paid' | 'refunded';
  amount_cents: number;
  payment_intent_id: string | null;
  occurred_at: string;
  events: { title: string; starts_at: string } | null;
};

export type Totals = {
  gross: number;
  refunded: number;
  net: number;
  platformFee: number;
  estPayout: number;
};

export type EventAgg = {
  eventId: string;
  eventTitle: string;
  eventStartsAt: string;
  gross: number;
  refunded: number;
  net: number;
  txnCount: number;
};

export type MonthAgg = { key: string; label: string; gross: number; refunded: number; net: number };

export type EarningsModel = {
  pro: boolean;
  feeRate: number;
  currentYear: number;
  hasTransactions: boolean;
  ytdTotals: Totals;
  allTimeTotals: Totals;
  /** Full per-event set (drives the row count + pagination total). */
  events: EventAgg[];
  /** Current-page slice of `events`. */
  pageEvents: EventAgg[];
  months: MonthAgg[];
  yearsWithActivity: number[];
};

function formatMonth(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
  });
}

/**
 * Host-facing summary of online ticket sales. Source of truth is
 * `event_payment_audit`, which the host can read via the
 * `event_payment_audit_select_host` RLS policy (host_id = auth.uid()
 * on the joined event).
 *
 * Stripe processing fees (~2.9% + 30¢) are NOT recorded here — they're
 * deducted by Stripe before payout. The Stripe Express dashboard has the
 * authoritative payout numbers; this page is a convenience summary keyed
 * on PickupVB's audit ledger.
 *
 * Platform fee is computed as a deterministic percentage of gross using
 * the host's CURRENT tier (5% standard, 2.5% Pro). If their tier changed
 * mid-year, the historical estimate may be slightly off — Stripe is the
 * final word, hence the disclaimer.
 */
export async function loadEarnings(page: number): Promise<EarningsModel> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/profile/billing/earnings');

  const pro = await isPro(user.id);
  const feeBps = pro ? PRO_PLATFORM_FEE_BPS : PLATFORM_FEE_BPS;
  const feeRate = feeBps / 10_000;

  // Scope to events THIS user hosts. The `_select_host` and `_select_own` RLS
  // policies compose with OR, so without this filter a host who also bought a
  // ticket on someone else's event would see that buyer row counted as their
  // own earnings (receipts-tax audit R-2). Filter the embedded `events`
  // resource by host_id; RLS still applies as defense-in-depth.
  const { data: rawRows } = await supabase
    .from('event_payment_audit')
    .select(
      'id, event_id, action, amount_cents, payment_intent_id, occurred_at, events:events!inner(title, starts_at)',
    )
    .eq('events.host_id', user.id)
    .in('category', ['ticket', 'tip', 'team'])
    .order('occurred_at', { ascending: false });

  const rows = (rawRows as unknown as AuditRow[] | null) ?? [];

  const transactions = groupAuditRowsByPaymentIntent(rows, (r) =>
    r.events
      ? { eventId: r.event_id, eventTitle: r.events.title, eventStartsAt: r.events.starts_at }
      : null,
  ).sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));

  const currentYear = new Date().getFullYear();
  const ytd = transactions.filter((t) => new Date(t.paidAt).getFullYear() === currentYear);

  function totals(txns: ReadonlyArray<{ paidCents: number; refundedCents: number }>): Totals {
    const gross = txns.reduce((s, t) => s + t.paidCents, 0);
    const refunded = txns.reduce((s, t) => s + t.refundedCents, 0);
    const net = gross - refunded;
    const platformFee = estimatePlatformFeeCents(net, feeRate);
    const estPayout = net - platformFee;
    return { gross, refunded, net, platformFee, estPayout };
  }

  const ytdTotals = totals(ytd);
  const allTimeTotals = totals(transactions);

  // Per-event aggregation (all-time).
  const byEvent = new Map<string, EventAgg>();
  for (const t of transactions) {
    const existing = byEvent.get(t.eventId);
    if (existing) {
      existing.gross += t.paidCents;
      existing.refunded += t.refundedCents;
      existing.net = existing.gross - existing.refunded;
      existing.txnCount += 1;
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
  // Totals span every event; only the per-event table is paged so a host with
  // a long event history doesn't render hundreds of rows at once.
  const pageEvents = events.slice((page - 1) * EVENTS_PER_PAGE, page * EVENTS_PER_PAGE);

  // Monthly breakdown for YTD.
  const byMonth = new Map<string, MonthAgg>();
  for (const t of ytd) {
    const d = new Date(t.paidAt);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const existing = byMonth.get(key);
    if (existing) {
      existing.gross += t.paidCents;
      existing.refunded += t.refundedCents;
      existing.net = existing.gross - existing.refunded;
    } else {
      byMonth.set(key, {
        key,
        label: formatMonth(t.paidAt),
        gross: t.paidCents,
        refunded: t.refundedCents,
        net: t.paidCents - t.refundedCents,
      });
    }
  }
  const months = Array.from(byMonth.values()).sort((a, b) => (a.key < b.key ? 1 : -1));

  const yearsWithActivity = Array.from(
    new Set(transactions.map((t) => new Date(t.paidAt).getFullYear())),
  ).sort((a, b) => b - a);

  return {
    pro,
    feeRate,
    currentYear,
    hasTransactions: transactions.length > 0,
    ytdTotals,
    allTimeTotals,
    events,
    pageEvents,
    months,
    yearsWithActivity,
  };
}
