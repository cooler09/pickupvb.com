import { getAdminSupabase } from '@/lib/supabase-admin';

export const metadata = {
  title: 'By the numbers',
  description:
    'PickupVB by the numbers: published events, attendees, and gross marketplace volume across the last 12 weeks. Updated every 30 minutes.',
  alternates: { canonical: '/about/numbers' },
  openGraph: {
    title: 'PickupVB by the numbers',
    description: 'Events, attendees, and GMV across the last 12 weeks of PickupVB events.',
    url: '/about/numbers',
    type: 'website',
  },
};

// ISR — re-render at most every 30 minutes. Numbers don't need to be
// minute-fresh and the underlying view scans every published public
// event; ISR makes the page survive a viral link without hammering PG.
export const revalidate = 1800;

type MetroRow = {
  metro: string | null;
  week_start: string;
  events_count: number;
  attendees_count: number;
  gmv_cents: number;
  avg_fill_rate: number | null;
};

type Totals = {
  events: number;
  attendees: number;
  gmvCents: number;
  metros: number;
  weeks: number;
};

type MetroTotal = {
  metro: string;
  events: number;
  attendees: number;
  gmvCents: number;
};

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/**
 * Aggregate the last 12 weeks of `metro_health_weekly` into totals
 * (whole-platform card grid) and per-metro rollups (table). Returns
 * empty defaults on any data-layer failure so the marketing page never
 * 500s for a transient DB blip.
 */
async function loadNumbers(): Promise<{ totals: Totals; perMetro: MetroTotal[] }> {
  const empty = {
    totals: { events: 0, attendees: 0, gmvCents: 0, metros: 0, weeks: 0 },
    perMetro: [] as MetroTotal[],
  };
  try {
    // Use the admin client because the page is viewer-independent —
    // `metro_health_weekly` is grant-selected to anon anyway, but using
    // the admin client lets the page stay statically renderable (no
    // `cookies()` access) so ISR works.
    const supabase = getAdminSupabase();
    const twelveWeeksAgo = new Date(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('metro_health_weekly')
      .select('metro, week_start, events_count, attendees_count, gmv_cents, avg_fill_rate')
      .gte('week_start', twelveWeeksAgo)
      .order('week_start', { ascending: false });
    if (error || !data) return empty;
    const rows = data as unknown as MetroRow[];

    const totals: Totals = {
      events: 0,
      attendees: 0,
      gmvCents: 0,
      metros: 0,
      weeks: 0,
    };
    const metroBuckets = new Map<string, MetroTotal>();
    const weekSet = new Set<string>();
    for (const r of rows) {
      const metro = (r.metro ?? 'Unknown').trim() || 'Unknown';
      totals.events += r.events_count;
      totals.attendees += r.attendees_count;
      totals.gmvCents += Number(r.gmv_cents);
      weekSet.add(r.week_start);
      const bucket = metroBuckets.get(metro) ?? {
        metro,
        events: 0,
        attendees: 0,
        gmvCents: 0,
      };
      bucket.events += r.events_count;
      bucket.attendees += r.attendees_count;
      bucket.gmvCents += Number(r.gmv_cents);
      metroBuckets.set(metro, bucket);
    }
    totals.metros = metroBuckets.size;
    totals.weeks = weekSet.size;
    const perMetro = Array.from(metroBuckets.values()).sort((a, b) => b.events - a.events);
    return { totals, perMetro };
  } catch {
    return empty;
  }
}

export default async function NumbersPage() {
  const { totals, perMetro } = await loadNumbers();
  const hasData = totals.events > 0;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">PickupVB by the numbers</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Rolling 12-week totals across published public events. Updated every 30 minutes. Sponsors
          and press —{' '}
          <a className="underline" href="mailto:hello@pickupvb.com">
            email us
          </a>{' '}
          for the full press kit.
        </p>
      </header>

      {!hasData ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-6 text-sm">
          No published events in the last 12 weeks yet — check back soon.
        </p>
      ) : (
        <>
          <section aria-label="Platform totals" className="mb-10">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="Events" value={formatNumber(totals.events)} />
              <StatCard label="Attendees" value={formatNumber(totals.attendees)} />
              <StatCard label="GMV" value={formatCurrency(totals.gmvCents)} />
              <StatCard label="Cities" value={formatNumber(totals.metros)} />
            </div>
            <p className="text-muted-foreground mt-3 text-xs">
              Across the last {totals.weeks} {totals.weeks === 1 ? 'week' : 'weeks'} of published,
              public-visibility events.
            </p>
          </section>

          {perMetro.length > 0 && (
            <section aria-label="By city">
              <h2 className="mb-3 text-xl font-medium">By city</h2>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-medium">
                        City
                      </th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">
                        Events
                      </th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">
                        Attendees
                      </th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">
                        GMV
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {perMetro.map((m) => (
                      <tr key={m.metro} className="border-t">
                        <td className="px-4 py-2">{m.metro}</td>
                        <td className="px-4 py-2 text-right">{formatNumber(m.events)}</td>
                        <td className="px-4 py-2 text-right">{formatNumber(m.attendees)}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(m.gmvCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      <footer className="text-muted-foreground mt-12 border-t pt-4 text-xs">
        <p>
          GMV = sum of paid ticket revenue, paid team-registration revenue, and paid tips across all
          published public events in the period. Attendees include both individual sign-ups and
          registered teams. Methodology, raw weekly rows, and CSV download available on request.
        </p>
      </footer>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card rounded-md border p-4">
      <div className="text-muted-foreground text-xs tracking-wide uppercase">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
