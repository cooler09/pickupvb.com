import Link from 'next/link';
import type { Route } from 'next';
import { isClubGroup } from '@/lib/club';
import { primaryButtonClass } from '@/components/primary-button';
import { loadClubDashboard, type ClubTotals } from './_loaders/load-club-dashboard';
import { requireGroupManager } from '../_lib/require-group-manager';

// Dynamic via `getServerSupabase()` (reads cookies); no `force-dynamic` needed.
export const metadata = {
  title: 'Club analytics — PickupVB',
  robots: { index: false, follow: false },
};

function usd(cents: number): string {
  return (cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

export default async function GroupAnalyticsPage(props: { params: Promise<{ id: string }> }) {
  // The route segment is the group SLUG (like the rest of /groups/[id]).
  const { id: slug } = await props.params;
  const { group } = await requireGroupManager(slug, `/groups/${slug}/analytics`);

  const club = await isClubGroup(group.id);

  if (!club) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 py-4">
        <Header name={group.name} />
        <section className="border-border-base bg-md-surface-container rounded-shape-sm space-y-4 border p-5 sm:p-6">
          <h2 className="text-fg text-lg font-semibold">Club feature</h2>
          <p className="text-muted text-sm">
            Club analytics — cross-event earnings and engagement for {group.name} — is included with
            a Club subscription.
          </p>
          <Link href={`/groups/${slug}/billing` as Route} className={primaryButtonClass('md')}>
            Set up Club →
          </Link>
        </section>
      </div>
    );
  }

  const m = await loadClubDashboard(group.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <Header name={group.name} />

      {/* ── Engagement (O-2b) ───────────────────────────────── */}
      <section className="border-border-base bg-md-surface-container rounded-shape-sm grid grid-cols-3 gap-4 border p-5">
        <Stat
          label="Events hosted"
          value={String(m.eventsHosted)}
          sub={`${m.upcoming} upcoming · ${m.past} past`}
        />
        <Stat label="Attendees" value={String(m.totalAttendees)} sub="across club events" />
        <Stat
          label="Net to club (all-time)"
          value={usd(m.allTimeTotals.net)}
          sub="club-routed events"
        />
      </section>

      {/* ── Club payout income (O-2c) ───────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-fg text-lg font-semibold">Club payout income</h2>
        <p className="text-muted text-sm">
          Online sales on events that paid out to the club&apos;s Stripe account. PickupVB&apos;s
          platform fee is estimated at {(m.feeRate * 100).toFixed(1)}%; Stripe&apos;s processing fee
          (~2.9% + 30¢) is separate and deducted before payout — the Stripe dashboard is the final
          word. Totals are all-time; the per-event table below reflects the last{' '}
          {m.detailWindowMonths} months.
        </p>
        {!m.hasEarnings ? (
          <p className="text-muted text-sm">
            No club-routed sales yet. Turn on “Pay out to {group.name}” on a paid event&apos;s edit
            page (before tickets sell) to route its income here.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <TotalsCard title="This year" totals={m.ytdTotals} usd={usd} />
              <TotalsCard title="All-time" totals={m.allTimeTotals} usd={usd} />
            </div>

            {m.events.length > 0 && (
              <div className="border-border-base rounded-shape-sm overflow-x-auto border">
                <table className="w-full text-sm">
                  <thead className="bg-fg/5 text-left">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-medium">
                        Event
                      </th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">
                        Gross
                      </th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">
                        Refunded
                      </th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">
                        Net
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-border-base divide-y">
                    {m.events.map((e) => (
                      <tr key={e.eventId}>
                        <td className="px-4 py-2">
                          <Link
                            href={`/events/${e.eventId}` as Route}
                            className="text-primary hover:underline"
                          >
                            {e.eventTitle}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-right">{usd(e.gross)}</td>
                        <td className="text-muted px-4 py-2 text-right">
                          {e.refunded > 0 ? `−${usd(e.refunded)}` : '—'}
                        </td>
                        <td className="px-4 py-2 text-right font-medium">{usd(e.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Header({ name }: { name: string }) {
  return (
    <header className="space-y-1">
      <h1 className="text-headline-lg font-bold">Club analytics</h1>
      <p className="text-muted text-sm">
        Earnings and engagement across <span className="font-medium">{name}</span>&apos;s events.
      </p>
    </header>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <p className="text-muted text-xs tracking-wide uppercase">{label}</p>
      <p className="text-fg text-title-lg font-bold">{value}</p>
      <p className="text-muted text-xs">{sub}</p>
    </div>
  );
}

function TotalsCard({
  title,
  totals,
  usd,
}: {
  title: string;
  totals: ClubTotals;
  usd: (c: number) => string;
}) {
  return (
    <div className="border-border-base bg-md-surface-container rounded-shape-sm space-y-1 border p-4">
      <p className="text-muted text-xs tracking-wide uppercase">{title}</p>
      <dl className="space-y-1 text-sm">
        <Row k="Gross" v={usd(totals.gross)} />
        <Row k="Refunded" v={totals.refunded > 0 ? `−${usd(totals.refunded)}` : '—'} />
        <Row k="Net" v={usd(totals.net)} />
        <Row k="Est. platform fee" v={`−${usd(totals.platformFee)}`} />
        <Row k="Est. payout" v={usd(totals.estPayout)} strong />
      </dl>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className={strong ? 'text-fg font-semibold' : 'text-fg'}>{v}</dd>
    </div>
  );
}
