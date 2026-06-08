import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { csvCell } from '@/lib/csv';
import { groupAuditRowsByPaymentIntent } from '@/lib/receipts';

export const dynamic = 'force-dynamic';

/**
 * GET /api/receipts/[year]/statement.csv
 *
 * Annual statement of every paid signup the viewer has made in the given
 * calendar year. Use for expense reports + tax filing.
 *
 * Source of truth: `event_payment_audit` (RLS scoped to user_id =
 * auth.uid() — see 20260521000000_receipts_rls.sql). Rows are grouped by
 * `payment_intent_id` so a paid+refund pair appears as one transaction
 * with a net amount.
 *
 * Columns: date_paid, event_title, event_date, event_city, event_region,
 * host, paid_usd, refunded_usd, net_usd, payment_intent_id.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ year: string }> },
): Promise<NextResponse> {
  const { year: yearStr } = await ctx.params;
  const year = Number(yearStr);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return new NextResponse('Invalid year', { status: 400 });
  }

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const start = new Date(Date.UTC(year, 0, 1)).toISOString();
  const end = new Date(Date.UTC(year + 1, 0, 1)).toISOString();

  type AuditRow = {
    id: string;
    event_id: string;
    user_id: string | null;
    action: 'paid' | 'refunded';
    amount_cents: number;
    payment_intent_id: string | null;
    off_platform: boolean;
    occurred_at: string;
    events: {
      title: string;
      starts_at: string;
      location_city: string | null;
      location_region: string | null;
      host_id: string | null;
    } | null;
  };

  const { data: rawRows } = await supabase
    .from('event_payment_audit')
    .select(
      'id, event_id, user_id, action, amount_cents, payment_intent_id, off_platform, occurred_at, events:events!inner(title, starts_at, location_city, location_region, host_id)',
    )
    .eq('user_id', user.id)
    .gte('occurred_at', start)
    .lt('occurred_at', end)
    .order('occurred_at', { ascending: true });

  const rows = (rawRows as unknown as AuditRow[] | null) ?? [];

  // Look up host display names once.
  const hostIds = Array.from(
    new Set(rows.map((r) => r.events?.host_id).filter(Boolean) as string[]),
  );
  const hostNameById = new Map<string, string>();
  if (hostIds.length > 0) {
    const { data: hostRows } = await supabase
      .from('profiles_public')
      .select('id, display_name')
      .in('id', hostIds);
    for (const h of (hostRows as { id: string; display_name: string | null }[] | null) ?? []) {
      hostNameById.set(h.id, h.display_name ?? '');
    }
  }

  const transactions = groupAuditRowsByPaymentIntent(rows, (r) =>
    r.events
      ? {
          eventTitle: r.events.title,
          eventStartsAt: r.events.starts_at,
          eventCity: r.events.location_city ?? '',
          eventRegion: r.events.location_region ?? '',
          hostName: r.events.host_id ? (hostNameById.get(r.events.host_id) ?? '') : '',
        }
      : null,
  ).sort((a, b) => (a.paidAt < b.paidAt ? -1 : 1));

  const usd = (c: number): string => (c / 100).toFixed(2);
  const header = [
    'date_paid',
    'event_title',
    'event_date',
    'event_city',
    'event_region',
    'host',
    'paid_usd',
    'refunded_usd',
    'net_usd',
    'payment_intent_id',
  ];
  const lines = [
    header.join(','),
    ...transactions.map((t) =>
      [
        csvCell(t.paidAt.slice(0, 10)),
        csvCell(t.eventTitle),
        csvCell(t.eventStartsAt.slice(0, 10)),
        csvCell(t.eventCity),
        csvCell(t.eventRegion),
        csvCell(t.hostName),
        usd(t.paidCents),
        usd(t.refundedCents),
        usd(t.paidCents - t.refundedCents),
        // Off-platform (cash) rows have no Stripe payment intent.
        csvCell(t.offPlatform ? 'off-platform' : t.paymentIntentId),
      ].join(','),
    ),
  ];

  const totalPaid = transactions.reduce((s, t) => s + t.paidCents, 0);
  const totalRefund = transactions.reduce((s, t) => s + t.refundedCents, 0);
  lines.push(
    [
      'TOTAL',
      '',
      '',
      '',
      '',
      '',
      usd(totalPaid),
      usd(totalRefund),
      usd(totalPaid - totalRefund),
      '',
    ].join(','),
  );

  const csv = lines.join('\n') + '\n';

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="pickupvb-receipts-${year}.csv"`,
      'cache-control': 'private, no-store',
    },
  });
}
