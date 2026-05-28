import { NextResponse } from 'next/server';
import { GetEventDetailQuery } from '@pickupvb/application';
import { handlers } from '@/lib/handlers';
import { getServerSupabase } from '@/lib/supabase';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { isPro } from '@/lib/pro';

export const dynamic = 'force-dynamic';

/**
 * GET /api/events/[id]/attendees.csv
 *
 * Pro-only attendee export with payment status. Authorized to event hosts /
 * co-hosts / group admins via the standard `canManage` check.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let detail;
  try {
    detail = await handlers.getEventDetail.execute(new GetEventDetailQuery(id, user.id));
  } catch {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (!detail.canManage) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  if (!(await isPro(user.id))) {
    return NextResponse.json(
      { error: 'PRO_REQUIRED', message: 'Upgrade to Pro to export attendees.' },
      { status: 402 },
    );
  }

  const admin = getAdminSupabase();
  const { data: rows } = await admin
    .from('event_participants')
    .select(
      'user_id, joined_at, position, payment:event_participant_payments(payment_status, amount_paid_cents, payment_intent_id), profiles:profiles!inner(display_name, first_name, last_name), division:event_divisions!inner(event_id)',
    )
    .eq('role', 'attendee')
    .eq('division.event_id', id);
  type Row = {
    user_id: string;
    joined_at: string;
    position: string | null;
    payment: {
      payment_status: string;
      amount_paid_cents: number;
      payment_intent_id: string | null;
    } | null;
    profiles: {
      display_name: string;
      first_name: string | null;
      last_name: string | null;
    } | null;
  };
  const typed = (rows as Row[] | null) ?? [];

  const header = [
    'user_id',
    'display_name',
    'first_name',
    'last_name',
    'joined_at',
    'position',
    'payment_status',
    'amount_paid_cents',
    'paid_via',
  ];
  const csv = [
    header.join(','),
    ...typed.map((r) => {
      const status = r.payment?.payment_status ?? 'pending';
      const amount = r.payment?.amount_paid_cents ?? 0;
      const pi = r.payment?.payment_intent_id ?? null;
      return [
        csvCell(r.user_id),
        csvCell(r.profiles?.display_name ?? ''),
        csvCell(r.profiles?.first_name ?? ''),
        csvCell(r.profiles?.last_name ?? ''),
        csvCell(r.joined_at),
        csvCell(r.position ?? ''),
        csvCell(status),
        String(amount),
        csvCell(pi ? 'stripe' : status === 'paid' ? 'manual' : ''),
      ].join(',');
    }),
  ].join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="event-${id}-attendees.csv"`,
    },
  });
}

function csvCell(s: string): string {
  if (s == null) return '';
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
