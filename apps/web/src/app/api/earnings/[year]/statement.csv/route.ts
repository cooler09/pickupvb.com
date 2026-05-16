import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { isPro, PRO_PLATFORM_FEE_BPS } from '@/lib/pro';
import { PLATFORM_FEE_BPS } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/**
 * GET /api/earnings/[year]/statement.csv
 *
 * Annual statement of every paid signup on events the viewer hosts. Use for
 * bookkeeping / tax filing. Pairs with the host earnings page at
 * /profile/billing/earnings.
 *
 * Source of truth: `event_payment_audit` (RLS scoped to host via
 * `event_payment_audit_select_host` policy — see
 * 20260522000000_earnings_rls.sql). Rows are grouped by `payment_intent_id`
 * so a paid+refund pair appears as one transaction with a net amount.
 *
 * Platform fee column is a deterministic estimate based on the host's
 * current Pro tier; Stripe's processing fee is not included (see Stripe
 * Express for authoritative payout amounts).
 *
 * Columns: date_paid, event_title, event_date, gross_usd, refunded_usd,
 * net_usd, est_platform_fee_usd, est_payout_usd, payment_intent_id.
 *
 * Path note: `[year].csv` confuses Next typedRoutes; keep param and literal
 * extension in separate segments.
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

    const pro = await isPro(user.id);
    const feeBps = pro ? PRO_PLATFORM_FEE_BPS : PLATFORM_FEE_BPS;
    const feeRate = feeBps / 10_000;

    const start = new Date(Date.UTC(year, 0, 1)).toISOString();
    const end = new Date(Date.UTC(year + 1, 0, 1)).toISOString();

    type AuditRow = {
        id: string;
        event_id: string;
        action: 'paid' | 'refunded' | 'failed';
        amount_cents: number;
        payment_intent_id: string | null;
        occurred_at: string;
        events: { title: string; starts_at: string } | null;
    };

    const { data: rawRows } = await supabase
        .from('event_payment_audit')
        .select(
            'id, event_id, action, amount_cents, payment_intent_id, occurred_at, events:events!inner(title, starts_at)',
        )
        .neq('action', 'failed')
        .gte('occurred_at', start)
        .lt('occurred_at', end)
        .order('occurred_at', { ascending: true });

    const rows = (rawRows as unknown as AuditRow[] | null) ?? [];

    type Txn = {
        paymentIntentId: string;
        eventTitle: string;
        eventStartsAt: string;
        paidCents: number;
        refundedCents: number;
        paidAt: string;
    };
    const byPi = new Map<string, Txn>();
    for (const r of rows) {
        if (!r.events) continue;
        const key = r.payment_intent_id ?? `audit:${r.id}`;
        const existing = byPi.get(key);
        if (existing) {
            if (r.action === 'paid') {
                existing.paidCents += r.amount_cents;
                if (r.occurred_at < existing.paidAt) existing.paidAt = r.occurred_at;
            } else {
                existing.refundedCents += r.amount_cents;
            }
        } else {
            byPi.set(key, {
                paymentIntentId: r.payment_intent_id ?? `audit:${r.id}`,
                eventTitle: r.events.title,
                eventStartsAt: r.events.starts_at,
                paidCents: r.action === 'paid' ? r.amount_cents : 0,
                refundedCents: r.action === 'refunded' ? r.amount_cents : 0,
                paidAt: r.occurred_at,
            });
        }
    }
    const transactions = Array.from(byPi.values()).sort((a, b) =>
        a.paidAt < b.paidAt ? -1 : 1,
    );

    const usd = (c: number): string => (c / 100).toFixed(2);
    const header = [
        'date_paid',
        'event_title',
        'event_date',
        'gross_usd',
        'refunded_usd',
        'net_usd',
        'est_platform_fee_usd',
        'est_payout_usd',
        'payment_intent_id',
    ];
    const lines = [header.join(',')];

    let totalGross = 0;
    let totalRefund = 0;
    for (const t of transactions) {
        const net = t.paidCents - t.refundedCents;
        const fee = Math.round(net * feeRate);
        const payout = net - fee;
        totalGross += t.paidCents;
        totalRefund += t.refundedCents;
        lines.push(
            [
                csvCell(t.paidAt.slice(0, 10)),
                csvCell(t.eventTitle),
                csvCell(t.eventStartsAt.slice(0, 10)),
                usd(t.paidCents),
                usd(t.refundedCents),
                usd(net),
                usd(fee),
                usd(payout),
                csvCell(t.paymentIntentId),
            ].join(','),
        );
    }
    const totalNet = totalGross - totalRefund;
    const totalFee = Math.round(totalNet * feeRate);
    const totalPayout = totalNet - totalFee;
    lines.push(
        [
            'TOTAL',
            '',
            '',
            usd(totalGross),
            usd(totalRefund),
            usd(totalNet),
            usd(totalFee),
            usd(totalPayout),
            '',
        ].join(','),
    );

    const csv = lines.join('\n') + '\n';

    return new NextResponse(csv, {
        status: 200,
        headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': `attachment; filename="pickupvb-earnings-${year}.csv"`,
            'cache-control': 'private, no-store',
        },
    });
}

function csvCell(s: string): string {
    if (s == null) return '';
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}
