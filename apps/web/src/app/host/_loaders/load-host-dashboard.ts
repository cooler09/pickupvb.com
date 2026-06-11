import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase';
import { hasProBenefits } from '@/lib/admin';
import { loadVisibleHostedEvents, type HostedEventRow } from '@/components/hosted-events-list';
import {
  monthlyNet,
  monthlySignups,
  revenueTotals,
  fillRate,
  needsAttention,
  type AttentionItem,
  type MonthlyNet,
} from './aggregate';

/** Trailing window for the revenue chart + windowed audit read. */
const REVENUE_CHART_MONTHS = 6;
const AUDIT_WINDOW_MONTHS = 12;

export type HostDashboardData = {
  /** False when the viewer hosts nothing — the page renders a CTA empty state. */
  isHost: boolean;
  metrics: {
    upcomingCount: number;
    lifetimeSignups: number;
    fillRate: number | null;
    netRevenueCents: number;
  };
  attention: AttentionItem[];
  revenueSeries: MonthlyNet[];
  signupSeries: MonthlyNet[];
  upcomingEvents: HostedEventRow[];
  recentEvents: HostedEventRow[];
  viewerIsPro: boolean;
};

type NarrowAuditRow = { action: string; amount_cents: number };
type WindowedAuditRow = { action: string; amount_cents: number; occurred_at: string };

/**
 * Loads everything the `/host` dashboard renders. Spans **all** events the
 * viewer hosts (primary + co-host) for counts / fill / charts via
 * `loadVisibleHostedEvents`, but scopes **revenue** to the viewer's own
 * `host_id` events — co-hosted revenue belongs to the primary host's payout
 * (pattern #7). All aggregation runs through the pure helpers in `aggregate.ts`.
 */
export async function loadHostDashboard(): Promise<HostDashboardData> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/host');

  const nowMs = Date.now();

  const events = await loadVisibleHostedEvents(supabase, user.id);

  if (events.length === 0) {
    return {
      isHost: false,
      metrics: { upcomingCount: 0, lifetimeSignups: 0, fillRate: null, netRevenueCents: 0 },
      attention: [],
      revenueSeries: monthlyNet([], nowMs, REVENUE_CHART_MONTHS),
      signupSeries: monthlySignups([], nowMs),
      upcomingEvents: [],
      recentEvents: [],
      viewerIsPro: await hasProBenefits(user.id),
    };
  }

  const upcomingEvents = events.filter((e) => new Date(e.starts_at).getTime() >= nowMs);
  // Recent first (most recently started at the top).
  const recentEvents = events
    .filter((e) => new Date(e.starts_at).getTime() < nowMs)
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());

  // Revenue is the host's own money only — co-hosted events pay out to their
  // primary host, so they're excluded from the revenue reads.
  const { data: ownRows } = await supabase.from('events_view').select('id').eq('host_id', user.id);
  const ownEventIds = ((ownRows as { id: string }[] | null) ?? []).map((r) => r.id);

  let allTimeAudits: NarrowAuditRow[] = [];
  let windowedAudits: WindowedAuditRow[] = [];
  if (ownEventIds.length > 0) {
    const auditWindowStart = new Date(nowMs);
    auditWindowStart.setUTCMonth(auditWindowStart.getUTCMonth() - AUDIT_WINDOW_MONTHS);
    const [{ data: rawAllTime }, { data: rawWindowed }] = await Promise.all([
      supabase
        .from('event_payment_audit')
        .select('action, amount_cents')
        .in('event_id', ownEventIds)
        .in('action', ['paid', 'refunded']),
      supabase
        .from('event_payment_audit')
        .select('action, amount_cents, occurred_at')
        .in('event_id', ownEventIds)
        .in('action', ['paid', 'refunded'])
        .gte('occurred_at', auditWindowStart.toISOString()),
    ]);
    allTimeAudits = (rawAllTime as NarrowAuditRow[] | null) ?? [];
    windowedAudits = (rawWindowed as WindowedAuditRow[] | null) ?? [];
  }

  const { netCents } = revenueTotals(allTimeAudits);
  const lifetimeSignups = events.reduce((sum, e) => sum + e.attendee_count, 0);

  return {
    isHost: true,
    metrics: {
      upcomingCount: upcomingEvents.length,
      lifetimeSignups,
      fillRate: fillRate(upcomingEvents),
      netRevenueCents: netCents,
    },
    attention: needsAttention(events, nowMs),
    revenueSeries: monthlyNet(windowedAudits, nowMs, REVENUE_CHART_MONTHS),
    signupSeries: monthlySignups(events, nowMs),
    upcomingEvents,
    recentEvents,
    viewerIsPro: await hasProBenefits(user.id),
  };
}
