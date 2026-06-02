import { redirect } from 'next/navigation';
import { primaryButtonClass } from '@/components/primary-button';
import Link from 'next/link';
import type { Route } from 'next';
import { getServerSupabase } from '@/lib/supabase';
import { hasProBenefits } from '@/lib/admin';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Host analytics — PickupVB',
  robots: { index: false, follow: false },
};

type EventRow = {
  id: string;
  title: string;
  starts_at: string;
};

type AttendeeRow = {
  event_id: string;
  user_id: string;
};

type DivisionRow = {
  event_id: string;
  max_spots: number | null;
};

type PaymentAuditRow = {
  event_id: string;
  action: string;
  amount_cents: number;
  occurred_at: string;
};

type MonthAgg = {
  key: string;
  label: string;
  gross: number;
  refunded: number;
  net: number;
};

function usd(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
  });
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export default async function HostAnalyticsPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login?next=/profile/billing/analytics');

  const entitled = await hasProBenefits(user.id);

  if (!entitled) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 py-4">
        <PageHeader />
        <section className="border-border-base bg-surface rounded-shape-sm space-y-4 border p-5 sm:p-6">
          <h2 className="text-fg text-lg font-semibold">Pro feature</h2>
          <p className="text-muted text-sm">
            Host analytics is included with Pro. Upgrade to unlock fill-rate and repeat-attendee
            insights for your events.
          </p>
          <div>
            <Link href={'/profile/billing/pro' as Route} className={primaryButtonClass('md')}>
              Upgrade to Pro →
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const { data: rawEvents } = await supabase
    .from('events')
    .select('id, title, starts_at')
    .eq('host_id', user.id)
    .order('starts_at', { ascending: false });

  const events = ((rawEvents as EventRow[] | null) ?? []).filter((e) => Boolean(e.id));
  const eventIds = events.map((e) => e.id);

  let attendees: AttendeeRow[] = [];
  let divisions: DivisionRow[] = [];
  let audits: PaymentAuditRow[] = [];

  if (eventIds.length > 0) {
    const [{ data: rawAttendees }, { data: rawDivisions }, { data: rawAudits }] = await Promise.all(
      [
        supabase
          .from('event_participants')
          .select('user_id, division:event_divisions!inner(event_id)')
          .eq('role', 'attendee')
          .in('division.event_id', eventIds),
        supabase.from('event_divisions').select('event_id, max_spots').in('event_id', eventIds),
        supabase
          .from('event_payment_audit')
          .select('event_id, action, amount_cents, occurred_at')
          .in('event_id', eventIds)
          .in('action', ['paid', 'refunded']),
      ],
    );

    attendees = (
      (rawAttendees as { user_id: string; division: { event_id: string } | null }[] | null) ?? []
    )
      .filter((a) => a.division != null)
      .map((a) => ({ event_id: a.division!.event_id, user_id: a.user_id })) as AttendeeRow[];
    divisions = (rawDivisions as DivisionRow[] | null) ?? [];
    audits = (rawAudits as PaymentAuditRow[] | null) ?? [];
  }

  const attendeeCountsByEvent = new Map<string, number>();
  const attendeeEventCountByUser = new Map<string, number>();
  for (const a of attendees) {
    attendeeCountsByEvent.set(a.event_id, (attendeeCountsByEvent.get(a.event_id) ?? 0) + 1);
    attendeeEventCountByUser.set(a.user_id, (attendeeEventCountByUser.get(a.user_id) ?? 0) + 1);
  }

  const uniqueAttendees = attendeeEventCountByUser.size;
  const repeatAttendees = Array.from(attendeeEventCountByUser.values()).filter((n) => n > 1).length;
  const repeatRate = uniqueAttendees > 0 ? repeatAttendees / uniqueAttendees : 0;

  const totalRegistrations = attendees.length;
  const eventIdsWithCapacity = new Set(
    divisions.filter((d) => d.max_spots !== null).map((d) => d.event_id),
  );
  const totalCapacity = divisions.reduce((sum, d) => sum + (d.max_spots ?? 0), 0);
  const registrationsWithCapacity = attendees.filter((a) =>
    eventIdsWithCapacity.has(a.event_id),
  ).length;
  const fillRate = totalCapacity > 0 ? registrationsWithCapacity / totalCapacity : null;

  const grossCents = audits
    .filter((a) => a.action === 'paid')
    .reduce((sum, a) => sum + a.amount_cents, 0);
  const refundedCents = audits
    .filter((a) => a.action === 'refunded')
    .reduce((sum, a) => sum + a.amount_cents, 0);
  const netCents = grossCents - refundedCents;

  const byMonth = new Map<string, MonthAgg>();
  for (const row of audits) {
    const d = new Date(row.occurred_at);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const existing = byMonth.get(key);
    if (existing) {
      if (row.action === 'paid') existing.gross += row.amount_cents;
      if (row.action === 'refunded') existing.refunded += row.amount_cents;
      existing.net = existing.gross - existing.refunded;
    } else {
      byMonth.set(key, {
        key,
        label: monthLabel(row.occurred_at),
        gross: row.action === 'paid' ? row.amount_cents : 0,
        refunded: row.action === 'refunded' ? row.amount_cents : 0,
        net: row.action === 'paid' ? row.amount_cents : -row.amount_cents,
      });
    }
  }

  const monthly = Array.from(byMonth.values())
    .sort((a, b) => (a.key < b.key ? 1 : -1))
    .slice(0, 6);

  const netByEvent = new Map<string, number>();
  for (const row of audits) {
    const delta = row.action === 'paid' ? row.amount_cents : -row.amount_cents;
    netByEvent.set(row.event_id, (netByEvent.get(row.event_id) ?? 0) + delta);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <PageHeader />

      {events.length === 0 && (
        <section className="border-border-base bg-surface rounded-shape-sm border p-5 sm:p-6">
          <p className="text-muted text-sm">
            No hosted events yet. Publish your first event to start building analytics history.
          </p>
        </section>
      )}

      {events.length > 0 && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Hosted events" value={String(events.length)} hint="Across all time" />
            <StatCard
              label="Registrations"
              value={String(totalRegistrations)}
              hint={`${uniqueAttendees} unique attendees`}
            />
            <StatCard
              label="Repeat attendee rate"
              value={pct(repeatRate)}
              hint={`${repeatAttendees}/${uniqueAttendees || 0} attendees`}
            />
            <StatCard
              label="Fill rate"
              value={fillRate == null ? 'n/a' : pct(fillRate)}
              hint={
                fillRate == null
                  ? 'Set max spots to track'
                  : `${registrationsWithCapacity}/${totalCapacity} spots (capacity-set events)`
              }
            />
          </section>

          <section className="border-border-base bg-surface rounded-shape-sm border p-5 sm:p-6">
            <h2 className="text-fg text-lg font-semibold">Revenue trend</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <MoneyStat label="Gross" value={usd(grossCents)} />
              <MoneyStat label="Refunds" value={`-${usd(refundedCents)}`} />
              <MoneyStat label="Net GMV" value={usd(netCents)} />
            </dl>
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-muted border-border-base border-b text-left text-xs tracking-wide uppercase">
                    <th className="py-2 pr-4 font-semibold">Month</th>
                    <th className="py-2 pr-4 font-semibold">Gross</th>
                    <th className="py-2 pr-4 font-semibold">Refunds</th>
                    <th className="py-2 pr-0 font-semibold">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.length === 0 ? (
                    <tr>
                      <td className="text-muted py-3" colSpan={4}>
                        No paid or refunded transactions yet.
                      </td>
                    </tr>
                  ) : (
                    monthly.map((m) => (
                      <tr key={m.key} className="border-border-base border-b last:border-b-0">
                        <td className="py-2 pr-4">{m.label}</td>
                        <td className="py-2 pr-4">{usd(m.gross)}</td>
                        <td className="py-2 pr-4">-{usd(m.refunded)}</td>
                        <td className="py-2 pr-0 font-medium">{usd(m.net)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="border-border-base bg-surface rounded-shape-sm border p-5 sm:p-6">
            <h2 className="text-fg text-lg font-semibold">Recent events</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-muted border-border-base border-b text-left text-xs tracking-wide uppercase">
                    <th className="py-2 pr-4 font-semibold">Event</th>
                    <th className="py-2 pr-4 font-semibold">Start</th>
                    <th className="py-2 pr-4 font-semibold">Registrations</th>
                    <th className="py-2 pr-0 font-semibold">Net GMV</th>
                  </tr>
                </thead>
                <tbody>
                  {events.slice(0, 10).map((e) => (
                    <tr key={e.id} className="border-border-base border-b last:border-b-0">
                      <td className="py-2 pr-4">{e.title}</td>
                      <td className="py-2 pr-4">
                        {new Date(e.starts_at).toLocaleDateString('en-US')}
                      </td>
                      <td className="py-2 pr-4">{attendeeCountsByEvent.get(e.id) ?? 0}</td>
                      <td className="py-2 pr-0">{usd(netByEvent.get(e.id) ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="text-muted text-xs">
            v1 note: no-show rate requires explicit check-in tracking and is not yet included.
          </p>
        </>
      )}
    </div>
  );
}

function PageHeader() {
  return (
    <div className="space-y-2">
      <Link href={'/profile/billing' as Route} className="text-primary text-sm hover:underline">
        ← Payouts
      </Link>
      <h1 className="text-fg text-3xl font-bold">Host analytics</h1>
      <p className="text-muted text-sm">
        Snapshot of hosted-event performance: fill rate, repeat attendees, and payment trend.
      </p>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="border-border-base bg-surface rounded-shape-sm border p-4">
      <p className="text-muted text-xs font-semibold tracking-wide uppercase">{label}</p>
      <p className="text-fg mt-1 text-2xl font-bold">{value}</p>
      <p className="text-muted mt-1 text-xs">{hint}</p>
    </div>
  );
}

function MoneyStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted text-xs tracking-wide uppercase">{label}</dt>
      <dd className="text-fg font-semibold">{value}</dd>
    </div>
  );
}
