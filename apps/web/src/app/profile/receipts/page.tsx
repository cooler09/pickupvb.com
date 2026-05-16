import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Receipts — PickupVB' };

type AuditRow = {
    id: string;
    event_id: string;
    user_id: string | null;
    action: 'paid' | 'refunded' | 'failed';
    amount_cents: number;
    payment_intent_id: string | null;
    occurred_at: string;
    events: { title: string; starts_at: string } | null;
};

type TransactionRow = {
    paymentIntentId: string;
    eventId: string;
    eventTitle: string;
    eventStartsAt: string;
    paidCents: number;
    refundedCents: number;
    netCents: number;
    paidAt: string;
    refundedAt: string | null;
};

function formatUsd(cents: number): string {
    const sign = cents < 0 ? '-' : '';
    return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

/**
 * Buyer-facing list of every paid signup the viewer has made, with refund
 * adjustments. Source of truth is `event_payment_audit` rather than
 * `event_attendees` because the latter is deleted on refund — business
 * buyers need the full ledger for expense reports / write-offs.
 *
 * Rows are grouped by `payment_intent_id` so a paid+refunded pair shows as
 * one transaction with a net amount.
 */
export default async function ReceiptsPage() {
    const supabase = await getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/login?next=/profile/receipts');

    const { data: rawRows } = await supabase
        .from('event_payment_audit')
        .select('id, event_id, user_id, action, amount_cents, payment_intent_id, occurred_at, events:events!inner(title, starts_at)')
        .eq('user_id', user.id)
        .neq('action', 'failed')
        .order('occurred_at', { ascending: false });

    const rows = (rawRows as unknown as AuditRow[] | null) ?? [];

    // Group by payment_intent_id (fall back to audit id for legacy rows).
    const byPi = new Map<string, TransactionRow>();
    for (const r of rows) {
        if (!r.events) continue;
        const key = r.payment_intent_id ?? `audit:${r.id}`;
        const existing = byPi.get(key);
        if (existing) {
            if (r.action === 'paid') {
                existing.paidCents += r.amount_cents;
                if (r.occurred_at < existing.paidAt) existing.paidAt = r.occurred_at;
            } else if (r.action === 'refunded') {
                existing.refundedCents += r.amount_cents;
                if (!existing.refundedAt || r.occurred_at > existing.refundedAt) {
                    existing.refundedAt = r.occurred_at;
                }
            }
            existing.netCents = existing.paidCents - existing.refundedCents;
        } else {
            byPi.set(key, {
                paymentIntentId: r.payment_intent_id ?? `audit:${r.id}`,
                eventId: r.event_id,
                eventTitle: r.events.title,
                eventStartsAt: r.events.starts_at,
                paidCents: r.action === 'paid' ? r.amount_cents : 0,
                refundedCents: r.action === 'refunded' ? r.amount_cents : 0,
                netCents:
                    r.action === 'paid' ? r.amount_cents : -r.amount_cents,
                paidAt: r.occurred_at,
                refundedAt: r.action === 'refunded' ? r.occurred_at : null,
            });
        }
    }

    const transactions = Array.from(byPi.values()).sort((a, b) =>
        a.paidAt < b.paidAt ? 1 : -1,
    );

    const totalNet = transactions.reduce((s, t) => s + t.netCents, 0);
    const currentYear = new Date().getFullYear();
    const ytdNet = transactions
        .filter((t) => new Date(t.paidAt).getFullYear() === currentYear)
        .reduce((s, t) => s + t.netCents, 0);

    return (
        <section className="space-y-6">
            <header className="space-y-2">
                <div className="flex items-center gap-3 text-sm">
                    <Link href="/profile" className="text-primary hover:underline">
                        ← Profile
                    </Link>
                </div>
                <h1 className="text-3xl font-bold">Receipts</h1>
                <p className="text-muted">
                    Every online payment you&apos;ve made for an event signup.
                    Keep these for expense reports and tax records.
                </p>
            </header>

            {transactions.length === 0 ? (
                <div className="rounded-lg border border-border-base bg-surface p-6 text-sm text-muted">
                    No paid signups yet. When you pay online for an event, a
                    receipt will show up here.
                </div>
            ) : (
                <>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-lg border border-border-base bg-fg/5 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                                {currentYear} total
                            </p>
                            <p className="mt-1 text-2xl font-bold">
                                {formatUsd(ytdNet)}
                            </p>
                        </div>
                        <div className="rounded-lg border border-border-base bg-fg/5 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                                All-time total
                            </p>
                            <p className="mt-1 text-2xl font-bold">
                                {formatUsd(totalNet)}
                            </p>
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-lg border border-border-base">
                        <table className="w-full text-sm">
                            <thead className="bg-fg/5 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                                <tr>
                                    <th className="px-3 py-2">Date</th>
                                    <th className="px-3 py-2">Event</th>
                                    <th className="px-3 py-2 text-right">Paid</th>
                                    <th className="px-3 py-2 text-right">Refund</th>
                                    <th className="px-3 py-2 text-right">Net</th>
                                    <th className="px-3 py-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {transactions.map((t) => (
                                    <tr
                                        key={t.paymentIntentId}
                                        className="border-t border-border-base"
                                    >
                                        <td className="whitespace-nowrap px-3 py-2 text-muted">
                                            {formatDate(t.paidAt)}
                                        </td>
                                        <td className="px-3 py-2">
                                            <Link
                                                href={`/events/${t.eventId}` as Route}
                                                className="text-primary hover:underline"
                                            >
                                                {t.eventTitle}
                                            </Link>
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2 text-right">
                                            {formatUsd(t.paidCents)}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2 text-right text-muted">
                                            {t.refundedCents > 0
                                                ? `−${formatUsd(t.refundedCents)}`
                                                : '—'}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2 text-right font-medium">
                                            {formatUsd(t.netCents)}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2 text-right">
                                            <Link
                                                href={
                                                    `/profile/receipts/${encodeURIComponent(t.paymentIntentId)}` as Route
                                                }
                                                className="text-primary hover:underline"
                                            >
                                                View
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className="text-xs text-muted">
                        Stripe also emails an itemized receipt for each payment at
                        the time of purchase. Need an older record or a corrected
                        receipt? Contact the event host directly.
                    </p>
                </>
            )}
        </section>
    );
}
