import Link from 'next/link';
import type { Route } from 'next';
import { loadEarnings } from './_loaders/load-earnings';
import {
  EarningsByEventTable,
  EarningsMonthlyStatements,
  EarningsTotals,
} from './_components/earnings-sections';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Earnings — PickupVB',
  robots: { index: false, follow: false },
};

export default async function EarningsPage(props: { searchParams: Promise<{ page?: string }> }) {
  const searchParams = await props.searchParams;
  const page = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);
  const {
    pro,
    feeRate,
    currentYear,
    hasTransactions,
    ytdTotals,
    allTimeTotals,
    events,
    pageEvents,
    months,
    yearsWithActivity,
  } = await loadEarnings(page);

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
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

      {!hasTransactions ? (
        <div className="border-border-base bg-surface text-muted rounded-shape-sm border p-6 text-sm">
          No online ticket sales yet. When attendees pay for one of your events through PickupVB,
          the totals will show up here.
        </div>
      ) : (
        <>
          <EarningsTotals
            currentYear={currentYear}
            feeRate={feeRate}
            ytdTotals={ytdTotals}
            allTimeTotals={allTimeTotals}
          />

          <EarningsByEventTable
            pageEvents={pageEvents}
            totalEvents={events.length}
            page={page}
            searchParams={searchParams}
          />

          <EarningsMonthlyStatements
            currentYear={currentYear}
            months={months}
            yearsWithActivity={yearsWithActivity}
          />
        </>
      )}
    </div>
  );
}
