import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { getServerSupabase } from '@/lib/supabase';
import { PrintButton } from './print-button';

export const dynamic = 'force-dynamic';
export const metadata = {
    title: 'Receipt — PickupVB',
    robots: { index: false, follow: false },
};

type AuditRow = {
    id: string;
    event_id: string;
    user_id: string | null;
    action: 'paid' | 'refunded' | 'failed';
    amount_cents: number;
    payment_intent_id: string | null;
    occurred_at: string;
    events: {
        id: string;
        title: string;
        starts_at: string;
        location_address: string | null;
        location_city: string | null;
        location_region: string | null;
        host_id: string | null;
    } | null;
};

function formatUsd(cents: number): string {
    const sign = cents < 0 ? '-' : '';
    return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function formatDateLong(iso: string): string {
    return new Date(iso).toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

/**
 * Printable receipt for a single Stripe payment intent. Aggregates every
 * audit row (paid + refunds) tied to the same `payment_intent_id` so the
 * customer sees the full net story on one page.
 *
 * Authorized via RLS: `event_payment_audit_select_own` ensures the viewer
 * can only read rows where `user_id = auth.uid()`.
 */
export default async function ReceiptDetailPage({
    params,
}: {
    params: Promise<{ paymentIntentId: string }>;
}) {
    const { paymentIntentId: rawId } = await params;
    const paymentIntentId = decodeURIComponent(rawId);

    const supabase = await getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect(`/login?next=/profile/receipts/${rawId}`);

    // The list page uses `audit:<row-id>` as a synthetic key when the audit
    // row has no `payment_intent_id` (rare: legacy rows or non-Stripe paths).
    // Detect and look up by row id in that case.
    const isAuditFallback = paymentIntentId.startsWith('audit:');
    const auditRowId = isAuditFallback ? paymentIntentId.slice('audit:'.length) : null;

    const baseSelect =
        'id, event_id, user_id, action, amount_cents, payment_intent_id, occurred_at, events:events!inner(id, title, starts_at, location_address, location_city, location_region, host_id)';

    const query = supabase
        .from('event_payment_audit')
        .select(baseSelect)
        .eq('user_id', user.id);

    const { data: rawRows } = isAuditFallback
        ? await query.eq('id', auditRowId!).order('occurred_at', { ascending: true })
        : await query.eq('payment_intent_id', paymentIntentId).order('occurred_at', { ascending: true });

    const rows = (rawRows as unknown as AuditRow[] | null) ?? [];
    if (rows.length === 0) notFound();

    const first = rows[0]!;
    const event = first.events;
    if (!event) notFound();

    let hostName = 'Event host';
    let hostBusinessName: string | null = null;
    let hostBusinessAddress: string | null = null;
    if (event.host_id) {
        const { data: hostRow } = await supabase
            .from('profiles')
            .select('display_name, business_name, business_address')
            .eq('id', event.host_id)
            .maybeSingle();
        const h = hostRow as { display_name: string | null; business_name: string | null; business_address: string | null } | null;
        hostName = h?.display_name ?? 'Event host';
        hostBusinessName = h?.business_name ?? null;
        hostBusinessAddress = h?.business_address ?? null;
    }

    // Buyer’s own business fields for “Billed to”.
    const { data: buyerRow } = await supabase
        .from('profiles')
        .select('display_name, business_name, business_address, tax_id')
        .eq('id', user.id)
        .maybeSingle();
    const buyer = (buyerRow as { display_name: string | null; business_name: string | null; business_address: string | null; tax_id: string | null } | null) ?? null;

    const paidCents = rows
        .filter((r) => r.action === 'paid')
        .reduce((s, r) => s + r.amount_cents, 0);
    const refundedCents = rows
        .filter((r) => r.action === 'refunded')
        .reduce((s, r) => s + r.amount_cents, 0);
    const netCents = paidCents - refundedCents;
    const paidAt = rows.find((r) => r.action === 'paid')?.occurred_at ?? first.occurred_at;
    const refundedAt = rows
        .filter((r) => r.action === 'refunded')
        .map((r) => r.occurred_at)
        .pop();

    const addressLine = [
        event.location_address,
        [event.location_city, event.location_region].filter(Boolean).join(', '),
    ]
        .filter(Boolean)
        .join(' — ');

    return (
        <section className="space-y-6">
            <div className="flex items-center justify-between gap-3 print:hidden">
                <Link
                    href={'/profile/receipts' as Route}
                    className="text-sm text-primary hover:underline"
                >
                    ← All receipts
                </Link>
                <PrintButton />
            </div>

            <article className="space-y-6 rounded-lg border border-border-base bg-surface p-6 print:border-0 print:p-0">
                <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border-base pb-4">
                    <div>
                        <h1 className="text-2xl font-bold">Receipt</h1>
                        <p className="text-sm text-muted">PickupVB</p>
                    </div>
                    <div className="text-right text-sm">
                        <p className="text-muted">Receipt #</p>
                        <p className="font-mono text-xs">{paymentIntentId}</p>
                        <p className="mt-2 text-muted">Date paid</p>
                        <p>{formatDateLong(paidAt)}</p>
                    </div>
                </header>

                <div className="grid gap-4 text-sm sm:grid-cols-2">
                    <div>
                        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                            Billed to
                        </h2>
                        {buyer?.business_name ? (
                            <>
                                <p className="mt-1 font-medium">{buyer.business_name}</p>
                                {buyer.business_address && (
                                    <p className="whitespace-pre-line text-muted">
                                        {buyer.business_address}
                                    </p>
                                )}
                                {buyer.tax_id && (
                                    <p className="text-muted">
                                        Tax ID: <span className="font-mono">{buyer.tax_id}</span>
                                    </p>
                                )}
                                <p className="mt-1 text-xs text-muted">
                                    Attn:{' '}
                                    {buyer.display_name ??
                                        user.email ??
                                        'Account holder'}
                                </p>
                            </>
                        ) : (
                            <>
                                <p className="mt-1 font-medium">
                                    {buyer?.display_name ??
                                        user.email ??
                                        'You'}
                                </p>
                                {user.email && (
                                    <p className="text-muted">{user.email}</p>
                                )}
                            </>
                        )}
                    </div>
                    <div>
                        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                            Sold by
                        </h2>
                        <p className="mt-1 font-medium">
                            {hostBusinessName ?? hostName}
                        </p>
                        {hostBusinessName && hostBusinessName !== hostName && (
                            <p className="text-xs text-muted">d/b/a {hostName}</p>
                        )}
                        {hostBusinessAddress && (
                            <p className="whitespace-pre-line text-muted">
                                {hostBusinessAddress}
                            </p>
                        )}
                        <p className="text-muted">
                            via PickupVB (processor: Stripe)
                        </p>
                    </div>
                </div>

                <div>
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                        Event
                    </h2>
                    <p className="mt-1 font-medium">
                        <Link
                            href={`/events/${event.id}` as Route}
                            className="hover:underline print:no-underline"
                        >
                            {event.title}
                        </Link>
                    </p>
                    <p className="text-sm text-muted">
                        {formatDateLong(event.starts_at)}
                    </p>
                    {addressLine && (
                        <p className="text-sm text-muted">{addressLine}</p>
                    )}
                </div>

                <div className="overflow-hidden rounded border border-border-base">
                    <table className="w-full text-sm">
                        <thead className="bg-fg/5 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                            <tr>
                                <th className="px-3 py-2">Description</th>
                                <th className="px-3 py-2 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="border-t border-border-base">
                                <td className="px-3 py-2">
                                    Event signup — {event.title}
                                </td>
                                <td className="px-3 py-2 text-right">
                                    {formatUsd(paidCents)}
                                </td>
                            </tr>
                            {refundedCents > 0 && (
                                <tr className="border-t border-border-base">
                                    <td className="px-3 py-2 text-muted">
                                        Refund
                                        {refundedAt
                                            ? ` (${formatDateLong(refundedAt)})`
                                            : ''}
                                    </td>
                                    <td className="px-3 py-2 text-right text-muted">
                                        −{formatUsd(refundedCents)}
                                    </td>
                                </tr>
                            )}
                            <tr className="border-t border-border-base bg-fg/5 font-semibold">
                                <td className="px-3 py-2">Net paid</td>
                                <td className="px-3 py-2 text-right">
                                    {formatUsd(netCents)}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <footer className="border-t border-border-base pt-4 text-xs text-muted">
                    <p>
                        Payment processed by Stripe. PickupVB is the platform; the
                        seller of record for the event is the host shown above.
                        Tax treatment of this payment is the responsibility of
                        the buyer and seller — consult your accountant.
                    </p>
                    <p className="mt-2">
                        Need a corrected receipt? Update your business name,
                        address, or tax ID under{' '}
                        <Link
                            href={'/profile/receipts' as Route}
                            className="text-primary hover:underline"
                        >
                            Receipts → Business info
                        </Link>
                        , then reprint. For host details, contact the host
                        directly.
                    </p>
                </footer>
            </article>
        </section>
    );
}
