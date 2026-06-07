import Link from 'next/link';
import type { Route } from 'next';
import { Pagination } from '@/components/pagination';
import {
  EVENTS_PER_PAGE,
  type EventAgg,
  type MonthAgg,
  type Totals,
} from '../_loaders/load-earnings';

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

/** YTD + all-time estimated-payout cards with the gross/refund/fee breakdown. */
export function EarningsTotals({
  currentYear,
  feeRate,
  ytdTotals,
  allTimeTotals,
}: {
  currentYear: number;
  feeRate: number;
  ytdTotals: Totals;
  allTimeTotals: Totals;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="border-border-base bg-surface rounded-shape-sm border p-4">
          <p className="text-muted text-xs font-semibold tracking-wide uppercase">
            {currentYear} estimated payout
          </p>
          <p className="text-headline-sm mt-1 font-bold">{formatUsd(ytdTotals.estPayout)}</p>
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
          <p className="text-headline-sm mt-1 font-bold">{formatUsd(allTimeTotals.estPayout)}</p>
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
        Estimated payout = gross − refunds − platform fee. Stripe&apos;s own processing fee (~2.9% +
        30¢ per transaction) is deducted separately by Stripe and is not shown here.
      </p>
    </>
  );
}

/** All-time per-event sales table (paged). */
export function EarningsByEventTable({
  pageEvents,
  totalEvents,
  page,
  searchParams,
}: {
  pageEvents: EventAgg[];
  totalEvents: number;
  page: number;
  searchParams: Record<string, string | undefined>;
}) {
  return (
    <section
      id="by-event"
      className="border-border-base bg-surface rounded-shape-sm overflow-hidden border"
    >
      <div className="border-border-base border-b p-4">
        <h2 className="text-fg text-sm font-semibold">By event</h2>
        <p className="text-muted mt-0.5 text-xs">All-time totals per event you&apos;ve hosted.</p>
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
            {pageEvents.map((e) => (
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
                <td className="text-right font-medium whitespace-nowrap">{formatUsd(e.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalEvents > EVENTS_PER_PAGE && (
        <div className="border-border-base border-t p-4">
          <Pagination
            basePath="/profile/billing/earnings"
            page={page}
            pageSize={EVENTS_PER_PAGE}
            total={totalEvents}
            searchParams={searchParams}
            scrollToId="by-event"
          />
        </div>
      )}
    </section>
  );
}

/** YTD monthly breakdown + per-year CSV statement download links. */
export function EarningsMonthlyStatements({
  currentYear,
  months,
  yearsWithActivity,
}: {
  currentYear: number;
  months: MonthAgg[];
  yearsWithActivity: number[];
}) {
  return (
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
                    <td className="text-right font-medium whitespace-nowrap">{formatUsd(m.net)}</td>
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
  );
}
