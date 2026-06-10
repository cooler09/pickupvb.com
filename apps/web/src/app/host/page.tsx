import Link from 'next/link';
import type { Route } from 'next';
import { primaryButtonClass, neutralButtonClass } from '@/components/primary-button';
import { BarChart } from '@/components/charts/bar-chart';
import { loadHostDashboard } from './_loaders/load-host-dashboard';
import { DashboardStatCards } from './_components/dashboard-stat-cards';
import { NeedsAttention } from './_components/needs-attention';
import { HostEventsTable } from './_components/host-events-table';

// Host-scoped surface — depends on the viewer's session (cookies via
// `getServerSupabase`), so it's dynamic by nature; no `force-dynamic` needed
// (it's not a public/cacheable page). Never index.
export const metadata = {
  title: 'Host dashboard — PickupVB',
  robots: { index: false, follow: false },
};

const EVENTS_PREVIEW = 6;

function usd(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function PageHeader() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <h1 className="text-fg text-headline-lg font-bold">Host dashboard</h1>
        <p className="text-muted text-sm">
          Your events at a glance — what needs attention, who&rsquo;s signing up, and how
          you&rsquo;re doing.
        </p>
      </div>
      <div className="flex gap-2">
        <Link href={'/events/new' as Route} className={primaryButtonClass('sm')}>
          Host an event
        </Link>
        <Link href={'/tools' as Route} className={neutralButtonClass('sm')}>
          Host tools
        </Link>
      </div>
    </div>
  );
}

export default async function HostDashboardPage() {
  const data = await loadHostDashboard();

  if (!data.isHost) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 py-4">
        <PageHeader />
        <section className="border-border-base bg-md-surface-container rounded-shape-sm border p-6 text-center sm:p-8">
          <h2 className="text-fg text-title-lg font-semibold">You haven&rsquo;t hosted yet</h2>
          <p className="text-muted mx-auto mt-2 max-w-md text-sm">
            Publish your first event to start tracking signups, fill rate, and revenue here.
          </p>
          <div className="mt-5">
            <Link href={'/events/new' as Route} className={primaryButtonClass('md')}>
              Host an event →
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const upcomingPreview = data.upcomingEvents.slice(0, EVENTS_PREVIEW);
  const recentPreview = data.recentEvents.slice(0, EVENTS_PREVIEW);
  const hasMoreEvents =
    data.upcomingEvents.length > EVENTS_PREVIEW || data.recentEvents.length > EVENTS_PREVIEW;

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-4">
      <PageHeader />

      <DashboardStatCards metrics={data.metrics} />

      <NeedsAttention items={data.attention} />

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="border-border-base bg-md-surface-container rounded-shape-sm border p-5 sm:p-6">
          <h2 className="text-fg text-title-lg font-semibold">Net revenue</h2>
          <p className="text-muted mb-4 text-xs">Last 6 months, after refunds</p>
          <BarChart
            data={data.revenueSeries.map((m) => ({ label: m.label, value: m.net }))}
            formatValue={usd}
            ariaLabel="Net revenue by month"
          />
        </div>
        <div className="border-border-base bg-md-surface-container rounded-shape-sm border p-5 sm:p-6">
          <h2 className="text-fg text-title-lg font-semibold">Signups by month</h2>
          <p className="text-muted mb-4 text-xs">Recent and upcoming demand</p>
          <BarChart
            data={data.signupSeries.map((m) => ({ label: m.label, value: m.net }))}
            formatValue={(n) => n.toLocaleString()}
            ariaLabel="Signups by month"
          />
        </div>
      </section>

      <HostEventsTable
        heading="Upcoming events"
        events={upcomingPreview}
        emptyText="No upcoming events. Schedule your next one to keep players coming back."
      />

      <HostEventsTable
        heading="Recent events"
        events={recentPreview}
        emptyText="Your past events will show here once you've hosted."
      />

      {hasMoreEvents && (
        <p className="text-center">
          <Link href={'/profile#hosting' as Route} className="text-primary text-sm hover:underline">
            See all your events →
          </Link>
        </p>
      )}

      <DeepAnalyticsCard viewerIsPro={data.viewerIsPro} />
    </div>
  );
}

/** Pro-gated link into the deep revenue/cohort analytics (kept where it lives
 *  today under Billing); non-Pro hosts see the upsell. */
function DeepAnalyticsCard({ viewerIsPro }: { viewerIsPro: boolean }) {
  return (
    <section className="border-border-base bg-md-surface-container rounded-shape-sm flex flex-wrap items-center justify-between gap-3 border p-5 sm:p-6">
      <div>
        <h2 className="text-fg text-title-lg font-semibold">Deep analytics</h2>
        <p className="text-muted mt-1 text-sm">
          {viewerIsPro
            ? 'Fill-rate, repeat-attendee, and full revenue-trend breakdowns.'
            : 'Unlock repeat-attendee and full revenue-trend insights with Pro.'}
        </p>
      </div>
      {viewerIsPro ? (
        <Link
          href={'/profile/billing/analytics' as Route}
          className={`${neutralButtonClass('sm')} shrink-0`}
        >
          View full analytics →
        </Link>
      ) : (
        <Link
          href={'/profile/billing/pro' as Route}
          className={`${primaryButtonClass('sm')} shrink-0`}
        >
          Upgrade to Pro →
        </Link>
      )}
    </section>
  );
}
