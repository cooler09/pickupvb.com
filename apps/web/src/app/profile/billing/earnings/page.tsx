import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { getServerSupabase } from '@/lib/supabase';
import { isPro, PRO_PLATFORM_FEE_BPS } from '@/lib/pro';
import { PLATFORM_FEE_BPS } from '@/lib/stripe';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Earnings — PickupVB',
  robots: { index: false, follow: false },
};

type AuditRow = {
  id: string;
  event_id: string;
  action: 'paid' | 'refunded' | 'failed';
  amount_cents: number;
  payment_intent_id: string | null;
  occurred_at: string;
  events: { title: string; starts_at: string } | null;
};

function formatUsd(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

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
export default async function EarningsPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/profile/billing/earnings');

  const pro = await isPro(user.id);
  const feeBps = pro ? PRO_PLATFORM_FEE_BPS : PLATFORM_FEE_BPS;
  const feeRate = feeBps / 10_000;

  const { data: rawRows } = await supabase
    .from('event_payment_audit')
    .select(
      'id, event_id, action, amount_cents, payment_intent_id, occurred_at, events:events!inner(title, starts_at)',
    )
    .neq('action', 'failed')
    .order('occurred_at', { ascending: false });

  const rows = (rawRows as unknown as AuditRow[] | null) ?? [];

  type Txn = {
    paymentIntentId: string;
    eventId: string;
    eventTitle: string;
    eventStartsAt: string;
    paidCents: number;
    refundedCents: number;
    paidAt: string;
  };
  const byPi = new Map<string, Txn>();
  for (const r of rows) {
    if (!r.events) continue;
    const key = r.payment_intent_id ?? `audit:${r.id}`;
    const existing = byPi.get(key);
    if (existing) {
      if (r.action === 'paid') {
        existing.paidCents += r.amount_cents;
        if (r.occurred_at < existing.paidAt) existing.paidAt = r.occurred_at;
      } else {
        existing.refundedCents += r.amount_cents;
      }
    } else {
      byPi.set(key, {
        paymentIntentId: r.payment_intent_id ?? `audit:${r.id}`,
        eventId: r.event_id,
        eventTitle: r.events.title,
        eventStartsAt: r.events.starts_at,
        paidCents: r.action === 'paid' ? r.amount_cents : 0,
        refundedCents: r.action === 'refunded' ? r.amount_cents : 0,
        paidAt: r.occurred_at,
      });
    }
  }
  const transactions = Array.from(byPi.values()).sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));

  const currentYear = new Date().getFullYear();
  const ytd = transactions.filter((t) => new Date(t.paidAt).getFullYear() === currentYear);

  function totals(txns: Txn[]) {
    const gross = txns.reduce((s, t) => s + t.paidCents, 0);
    const refunded = txns.reduce((s, t) => s + t.refundedCents, 0);
    const net = gross - refunded;
    const platformFee = Math.round(net * feeRate);
    const estPayout = net - platformFee;
    return { gross, refunded, net, platformFee, estPayout };
  }

  const ytdTotals = totals(ytd);
  const allTimeTotals = totals(transactions);

  // Per-event aggregation (all-time).
  type EventAgg = {
    eventId: string;
    eventTitle: string;
    eventStartsAt: string;
    gross: number;
    refunded: number;
    net: number;
    txnCount: number;
  };
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

  // Monthly breakdown for YTD.
  type MonthAgg = { key: string; label: string; gross: number; refunded: number; net: number };
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

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="space-y-2">
        <Link href={'/profile/billing' as Route} className="text-primary text-sm hover:underline">
          ← Payouts
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold">Earnings</h1>
          {pro && (
            <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-semibold tracking-wide uppercase">
              Pro · {(feeRate * 100).toFixed(1)}% fee
            </span>
          )}
        </div>
        <p className="text-muted text-sm">
          Summary of your online ticket sales on PickupVB. For authoritative payout amounts and
          Stripe&apos;s processing fees, see your Stripe Express dashboard.
        </p>
      </div>

      {transactions.length === 0 ? (
        <div className="border-border-base bg-surface text-muted rounded-shape-sm border p-6 text-sm">
          No online ticket sales yet. When attendees pay for one of your events through PickupVB,
          the totals will show up here.
        </div>
      ) : (
        <>
          {/* ── Totals ──────────────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="border-border-base bg-surface rounded-shape-sm border p-4">
              <p className="text-muted text-xs font-semibold tracking-wide uppercase">
                {currentYear} estimated payout
              </p>
              <p className="mt-1 text-2xl font-bold">{formatUsd(ytdTotals.estPayout)}</p>
              <dl className="text-muted mt-2 space-y-0.5 text-xs">
                <div className="flex justify-between">
                  <dt>Gross</dt>
                  <dd>{formatUsd(ytdTotals.gross)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Refunds</dt>
                  <dd>−{formatUsd(ytdTotals.refunded)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Platform fee ({(feeRate * 100).toFixed(1)}%)</dt>
                  <dd>−{formatUsd(ytdTotals.platformFee)}</dd>
                </div>
              </dl>
            </div>
            <div className="border-border-base bg-surface rounded-shape-sm border p-4">
              <p className="text-muted text-xs font-semibold tracking-wide uppercase">
                All-time estimated payout
              </p>
              <p className="mt-1 text-2xl font-bold">{formatUsd(allTimeTotals.estPayout)}</p>
              <dl className="text-muted mt-2 space-y-0.5 text-xs">
                <div className="flex justify-between">
                  <dt>Gross</dt>
                  <dd>{formatUsd(allTimeTotals.gross)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Refunds</dt>
                  <dd>−{formatUsd(allTimeTotals.refunded)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Platform fee ({(feeRate * 100).toFixed(1)}%)</dt>
                  <dd>−{formatUsd(allTimeTotals.platformFee)}</dd>
                </div>
              </dl>
            </div>
          </div>

          <p className="text-muted text-xs">
            Estimated payout = gross − refunds − platform fee. Stripe&apos;s own processing fee
            (~2.9% + 30¢ per transaction) is deducted separately by Stripe and is not shown here.
          </p>

          {/* ── By event (primary breakdown) ────────────────── */}
          <section className="border-border-base bg-surface rounded-shape-sm overflow-hidden border">
            <div className="border-border-base border-b p-4">
              <h2 className="text-fg text-sm font-semibold">By event</h2>
              <p className="text-muted mt-0.5 text-xs">
                All-time totals per event you&apos;ve hosted.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="md-table md-density-compact md:md-density-comfortable w-full text-sm">
                <thead className="bg-fg/5 text-muted text-left text-xs font-semibold tracking-wide uppercase">
                  <tr>
                    <th scope="col">Event</th>
                    <th scope="col" className="hidden sm:table-cell">
                      Date
                    </th>
                    <th scope="col" className="hidden text-right md:table-cell">
                      Sales
                    </th>
                    <th scope="col" className="text-right">
                      Gross
                    </th>
                    <th scope="col" className="hidden text-right sm:table-cell">
                      Refunds
                    </th>
                    <th scope="col" className="text-right">
                      Net
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.eventId} className="border-border-base border-t">
                      <td>
                        <Link
                          href={`/events/${e.eventId}` as Route}
                          className="text-primary hover:underline"
                        >
                          {e.eventTitle}
                        </Link>
                      </td>
                      <td className="text-muted hidden whitespace-nowrap sm:table-cell">
                        {formatDate(e.eventStartsAt)}
                      </td>
                      <td className="text-muted hidden text-right whitespace-nowrap md:table-cell">
                        {e.txnCount}
                      </td>
                      <td className="text-right whitespace-nowrap">{formatUsd(e.gross)}</td>
                      <td className="text-muted hidden text-right whitespace-nowrap sm:table-cell">
                        {e.refunded > 0 ? `−${formatUsd(e.refunded)}` : '—'}
                      </td>
                      <td className="text-right font-medium whitespace-nowrap">
                        {formatUsd(e.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Monthly + statements ────────────────────────── */}
          <div className="grid gap-4 md:grid-cols-2">
            {months.length > 0 && (
              <details className="group border-border-base bg-surface rounded-shape-sm border" open>
                <summary className="hover:bg-fg/5 flex cursor-pointer items-center justify-between gap-2 p-4">
                  <div>
                    <h2 className="text-fg text-sm font-semibold">{currentYear} by month</h2>
                    <p className="text-muted mt-0.5 text-xs">Monthly net for the current year.</p>
                  </div>
                  <span className="text-muted text-xs group-open:hidden">Show</span>
                  <span className="text-muted hidden text-xs group-open:inline">Hide</span>
                </summary>
                <div className="border-border-base overflow-x-auto border-t">
                  <table className="md-table md-density-compact md:md-density-comfortable w-full text-sm">
                    <thead className="bg-fg/5 text-muted text-left text-xs font-semibold tracking-wide uppercase">
                      <tr>
                        <th scope="col">Month</th>
                        <th scope="col" className="text-right">
                          Gross
                        </th>
                        <th scope="col" className="hidden text-right sm:table-cell">
                          Refunds
                        </th>
                        <th scope="col" className="text-right">
                          Net
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {months.map((m) => (
                        <tr key={m.key} className="border-border-base border-t">
                          <td className="text-muted">{m.label}</td>
                          <td className="text-right whitespace-nowrap">{formatUsd(m.gross)}</td>
                          <td className="text-muted hidden text-right whitespace-nowrap sm:table-cell">
                            {m.refunded > 0 ? `−${formatUsd(m.refunded)}` : '—'}
                          </td>
                          <td className="text-right font-medium whitespace-nowrap">
                            {formatUsd(m.net)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            {yearsWithActivity.length > 0 && (
              <section className="border-border-base bg-surface rounded-shape-sm border p-4">
                <h2 className="text-fg text-sm font-semibold">Annual statements</h2>
                <p className="text-muted mt-1 text-xs">
                  Per-year CSV of every paid signup. Good for taxes and bookkeeping.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {yearsWithActivity.map((y) => (
                    <a
                      key={y}
                      href={`/api/earnings/${y}/statement.csv`}
                      className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1.5 text-sm"
                    >
                      {y} CSV ↓
                    </a>
                  ))}
                </div>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}
