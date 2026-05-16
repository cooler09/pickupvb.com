import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { getServerSupabase } from '@/lib/supabase';
import { PrintButton } from './print-button';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Receipt — PickupVB' };

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

    const { data: rawRows } = await supabase
        .from('event_payment_audit')
        .select(
            'id, event_id, user_id, action, amount_cents, payment_intent_id, occurred_at, events:events!inner(id, title, starts_at, location_address, location_city, location_region, host_id)',
        )
        .eq('user_id', user.id)
        .eq('payment_intent_id', paymentIntentId)
        .order('occurred_at', { ascending: true });

    const rows = (rawRows as unknown as AuditRow[] | null) ?? [];
    if (rows.length === 0) notFound();

    const first = rows[0]!;
    const event = first.events;
    if (!event) notFound();

    let hostName = 'Event host';
    if (event.host_id) {
        const { data: hostRow } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('id', event.host_id)
            .maybeSingle();
        hostName =
            (hostRow as { display_name: string | null } | null)?.display_name ??
            'Event host';
    }

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
                        <p className="mt-1 font-medium">
                            {user.user_metadata?.['display_name'] ?? user.email ?? 'You'}
                        </p>
                        {user.email && <p className="text-muted">{user.email}</p>}
                    </div>
                    <div>
                        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                            Sold by
                        </h2>
                        <p className="mt-1 font-medium">{hostName}</p>
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
                        For corrections or business-name receipts, contact the
                        host. For platform questions, contact PickupVB support.
                    </p>
                </footer>
            </article>
        </section>
    );
}
