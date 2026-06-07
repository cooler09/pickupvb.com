import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { getServerSupabase } from '@/lib/supabase';
import { Pagination } from '@/components/pagination';
import { BusinessInfoForm } from './business-info-form';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Receipts — PickupVB',
  robots: { index: false, follow: false },
};

const RECEIPTS_PER_PAGE = 20;

type AuditRow = {
  id: string;
  event_id: string;
  user_id: string | null;
  action: 'paid' | 'refunded' | 'failed';
  amount_cents: number;
  payment_intent_id: string | null;
  occurred_at: string;
  events: { title: string; starts_at: string } | null;
};

type TransactionRow = {
  paymentIntentId: string;
  eventId: string;
  eventTitle: string;
  eventStartsAt: string;
  paidCents: number;
  refundedCents: number;
  netCents: number;
  paidAt: string;
  refundedAt: string | null;
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

/**
 * Buyer-facing list of every paid signup the viewer has made, with refund
 * adjustments. Source of truth is `event_payment_audit` rather than
 * `event_attendees` because the latter is deleted on refund — business
 * buyers need the full ledger for expense reports / write-offs.
 *
 * Rows are grouped by `payment_intent_id` so a paid+refunded pair shows as
 * one transaction with a net amount.
 */
export default async function ReceiptsPage(props: { searchParams: Promise<{ page?: string }> }) {
  const searchParams = await props.searchParams;
  const page = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/profile/receipts');

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('business_name, business_address, tax_id')
    .eq('id', user.id)
    .maybeSingle();
  const profile =
    (profileRow as {
      business_name: string | null;
      business_address: string | null;
      tax_id: string | null;
    } | null) ?? null;

  const { data: rawRows } = await supabase
    .from('event_payment_audit')
    .select(
      'id, event_id, user_id, action, amount_cents, payment_intent_id, occurred_at, events:events!inner(title, starts_at)',
    )
    .eq('user_id', user.id)
    .neq('action', 'failed')
    .order('occurred_at', { ascending: false });

  const rows = (rawRows as unknown as AuditRow[] | null) ?? [];

  // Group by payment_intent_id (fall back to audit id for legacy rows).
  const byPi = new Map<string, TransactionRow>();
  for (const r of rows) {
    if (!r.events) continue;
    const key = r.payment_intent_id ?? `audit:${r.id}`;
    const existing = byPi.get(key);
    if (existing) {
      if (r.action === 'paid') {
        existing.paidCents += r.amount_cents;
        if (r.occurred_at < existing.paidAt) existing.paidAt = r.occurred_at;
      } else if (r.action === 'refunded') {
        existing.refundedCents += r.amount_cents;
        if (!existing.refundedAt || r.occurred_at > existing.refundedAt) {
          existing.refundedAt = r.occurred_at;
        }
      }
      existing.netCents = existing.paidCents - existing.refundedCents;
    } else {
      byPi.set(key, {
        paymentIntentId: r.payment_intent_id ?? `audit:${r.id}`,
        eventId: r.event_id,
        eventTitle: r.events.title,
        eventStartsAt: r.events.starts_at,
        paidCents: r.action === 'paid' ? r.amount_cents : 0,
        refundedCents: r.action === 'refunded' ? r.amount_cents : 0,
        netCents: r.action === 'paid' ? r.amount_cents : -r.amount_cents,
        paidAt: r.occurred_at,
        refundedAt: r.action === 'refunded' ? r.occurred_at : null,
      });
    }
  }

  const transactions = Array.from(byPi.values()).sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));

  const totalNet = transactions.reduce((s, t) => s + t.netCents, 0);
  const currentYear = new Date().getFullYear();
  const ytdNet = transactions
    .filter((t) => new Date(t.paidAt).getFullYear() === currentYear)
    .reduce((s, t) => s + t.netCents, 0);

  // Distinct years with activity, newest first, for the per-year CSV downloads.
  const yearsWithActivity = Array.from(
    new Set(transactions.map((t) => new Date(t.paidAt).getFullYear())),
  ).sort((a, b) => b - a);

  // Totals / years above span the full ledger; only the rendered table is
  // paged so a long payment history doesn't blow up the DOM.
  const pageTransactions = transactions.slice(
    (page - 1) * RECEIPTS_PER_PAGE,
    page * RECEIPTS_PER_PAGE,
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="space-y-2">
        <Link href={'/profile' as Route} className="text-primary text-sm hover:underline">
          ← Profile
        </Link>
        <h1 className="text-headline-lg font-bold">Receipts</h1>
        <p className="text-muted text-sm">
          Every online payment you&apos;ve made for an event signup. Keep these for expense reports
          and tax records.
        </p>
      </div>

      {transactions.length === 0 ? (
        <div className="border-border-base bg-surface text-muted rounded-shape-sm border p-6 text-sm">
          No paid signups yet. When you pay online for an event, a receipt will show up here.
        </div>
      ) : (
        <>
          {/* ── Totals ──────────────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="border-border-base bg-surface rounded-shape-sm border p-4">
              <p className="text-muted text-xs font-semibold tracking-wide uppercase">
                {currentYear} total
              </p>
              <p className="text-headline-sm mt-1 font-bold">{formatUsd(ytdNet)}</p>
            </div>
            <div className="border-border-base bg-surface rounded-shape-sm border p-4">
              <p className="text-muted text-xs font-semibold tracking-wide uppercase">
                All-time total
              </p>
              <p className="text-headline-sm mt-1 font-bold">{formatUsd(totalNet)}</p>
            </div>
          </div>

          {/* ── Transactions table ──────────────────────────── */}
          <div
            id="receipts"
            className="border-border-base bg-surface rounded-shape-sm overflow-hidden border"
          >
            <table className="md-table md-density-compact md:md-density-comfortable w-full text-sm">
              <thead className="bg-fg/5 text-muted text-left text-xs font-semibold tracking-wide uppercase">
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Event</th>
                  <th scope="col" className="text-right">
                    Paid
                  </th>
                  <th scope="col" className="hidden text-right sm:table-cell">
                    Refund
                  </th>
                  <th scope="col" className="text-right">
                    Net
                  </th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {pageTransactions.map((t) => (
                  <tr key={t.paymentIntentId} className="border-border-base border-t">
                    <td className="text-muted whitespace-nowrap">{formatDate(t.paidAt)}</td>
                    <td>
                      <Link
                        href={`/events/${t.eventId}` as Route}
                        className="text-primary hover:underline"
                      >
                        {t.eventTitle}
                      </Link>
                    </td>
                    <td className="text-right whitespace-nowrap">{formatUsd(t.paidCents)}</td>
                    <td className="text-muted hidden text-right whitespace-nowrap sm:table-cell">
                      {t.refundedCents > 0 ? `−${formatUsd(t.refundedCents)}` : '—'}
                    </td>
                    <td className="text-right font-medium whitespace-nowrap">
                      {formatUsd(t.netCents)}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <Link
                        href={`/profile/receipts/${encodeURIComponent(t.paymentIntentId)}` as Route}
                        className="text-primary hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            basePath="/profile/receipts"
            page={page}
            pageSize={RECEIPTS_PER_PAGE}
            total={transactions.length}
            searchParams={searchParams}
            scrollToId="receipts"
          />

          <p className="text-muted text-xs">
            Stripe also emails an itemized receipt for each payment at the time of purchase. Need an
            older record or a corrected receipt? Contact the event host directly.
          </p>

          {/* ── Annual statements + business info ───────────── */}
          <div className="grid gap-4 md:grid-cols-2">
            {yearsWithActivity.length > 0 && (
              <section className="border-border-base bg-surface rounded-shape-sm border p-4">
                <h2 className="text-fg text-sm font-semibold">Annual statements</h2>
                <p className="text-muted mt-1 text-xs">
                  CSV of every paid signup in a calendar year. Good for expense reports and taxes.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {yearsWithActivity.map((y) => (
                    <a
                      key={y}
                      href={`/api/receipts/${y}/statement.csv`}
                      className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1.5 text-sm"
                    >
                      {y} CSV ↓
                    </a>
                  ))}
                </div>
              </section>
            )}

            <details className="group border-border-base bg-surface rounded-shape-sm border">
              <summary className="hover:bg-fg/5 flex cursor-pointer items-center justify-between gap-2 p-4">
                <div>
                  <h2 className="text-fg text-sm font-semibold">Business / receipt info</h2>
                  <p className="text-muted mt-0.5 text-xs">
                    {profile?.business_name
                      ? `Set: ${profile.business_name}`
                      : 'Optional — appears as “Billed to” on receipts'}
                  </p>
                </div>
                <span className="text-muted text-xs group-open:hidden">Edit</span>
                <span className="text-muted hidden text-xs group-open:inline">Collapse</span>
              </summary>
              <div className="border-border-base border-t p-4">
                <BusinessInfoForm
                  businessName={profile?.business_name ?? null}
                  businessAddress={profile?.business_address ?? null}
                  taxId={profile?.tax_id ?? null}
                />
              </div>
            </details>
          </div>
        </>
      )}
    </div>
  );
}
