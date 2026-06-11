import type { HostDashboardData } from '../_loaders/load-host-dashboard';

function usd(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="border-border-base bg-md-surface-container rounded-shape-sm border p-4">
      <p className="text-muted text-xs font-semibold tracking-wide uppercase">{label}</p>
      <p className="text-fg text-headline-sm mt-1 font-bold tabular-nums">{value}</p>
      <p className="text-muted mt-1 text-xs">{hint}</p>
    </div>
  );
}

/** At-a-glance metric grid for the host dashboard (free to every host). */
export function DashboardStatCards({ metrics }: { metrics: HostDashboardData['metrics'] }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Upcoming events"
        value={String(metrics.upcomingCount)}
        hint={metrics.upcomingCount === 0 ? 'Nothing scheduled' : 'On your calendar'}
      />
      <StatCard
        label="Lifetime signups"
        value={metrics.lifetimeSignups.toLocaleString()}
        hint="Across all your events"
      />
      <StatCard
        label="Fill rate"
        value={metrics.fillRate == null ? 'n/a' : pct(metrics.fillRate)}
        hint={metrics.fillRate == null ? 'Set max spots to track' : 'Upcoming, capacity-set events'}
      />
      <StatCard
        label="Net revenue"
        value={usd(metrics.netRevenueCents)}
        hint="All time, after refunds"
      />
    </section>
  );
}
