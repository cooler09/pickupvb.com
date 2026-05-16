import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase';
import { isStripeConfigured } from '@/lib/stripe';
import {
    getHostSubscription,
    isPro,
    PRO_MONTHLY_PRICE_USD,
    PRO_YEARLY_PRICE_USD,
} from '@/lib/pro';
import { startProCheckout, openBillingPortal } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pro Host — PickupVB' };

type SearchParams = Promise<{ status?: string; error?: string }>;

function formatDate(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

export default async function ProBillingPage(props: { searchParams: SearchParams }) {
    const sp = await props.searchParams;

    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login?next=/profile/billing/pro');

    const sub = isStripeConfigured() ? await getHostSubscription(user.id) : null;
    const active = isStripeConfigured() ? await isPro(user.id) : false;

    return (
        <section className="space-y-6">
            <header className="space-y-2">
                <div className="flex items-center gap-3 text-sm">
                    <Link href="/profile/billing" className="text-primary hover:underline">
                        ← Payouts
                    </Link>
                </div>
                <h1 className="text-3xl font-bold">Pro Host</h1>
                <p className="text-muted">
                    Upgrade to unlock unlimited paid events, a lower platform fee,
                    and CSV attendee exports.
                </p>
            </header>

            {!isStripeConfigured() && (
                <div className="rounded-lg border border-border-base bg-surface p-4 text-sm">
                    Payments are not configured on this server.
                </div>
            )}

            {sp.status === 'success' && (
                <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">
                    Thanks! Your subscription is being activated — it usually shows
                    as active within a few seconds.
                </div>
            )}
            {sp.error === 'anonymous' && (
                <div className="rounded-lg border border-secondary bg-secondary/10 p-4 text-sm">
                    You need a permanent account (with email) to subscribe.
                </div>
            )}
            {sp.error === 'no_customer' && (
                <div className="rounded-lg border border-secondary bg-secondary/10 p-4 text-sm">
                    No subscription yet. Start one below.
                </div>
            )}

            <section className="rounded-lg border border-border-base p-6">
                <h2 className="text-xl font-semibold">Perks</h2>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                    <li>
                        <strong className="text-fg">2.5%</strong> platform fee on
                        paid events (free hosts pay 5%).
                    </li>
                    <li>
                        <strong className="text-fg">Unlimited paid events.</strong>{' '}
                        Free hosts are capped at 1 paid event per 30 days.
                    </li>
                    <li>
                        CSV attendee export with payment status.
                    </li>
                </ul>
            </section>

            {active && sub ? (
                <section className="space-y-4 rounded-lg border border-emerald-300 bg-emerald-50/40 p-6">
                    <div className="flex items-baseline justify-between">
                        <h2 className="text-xl font-semibold">
                            Pro {sub.plan ? `(${sub.plan})` : ''}
                        </h2>
                        <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold uppercase text-white">
                            {sub.status}
                        </span>
                    </div>
                    {sub.trial_end && new Date(sub.trial_end).getTime() > Date.now() && (
                        <p className="text-sm text-muted">
                            Trial ends <strong>{formatDate(sub.trial_end)}</strong>.
                        </p>
                    )}
                    {sub.current_period_end && (
                        <p className="text-sm text-muted">
                            {sub.cancel_at_period_end ? 'Cancels' : 'Renews'} on{' '}
                            <strong>{formatDate(sub.current_period_end)}</strong>.
                        </p>
                    )}
                    <form action={openBillingPortal}>
                        <button
                            type="submit"
                            className="rounded-md border border-border-base bg-surface px-4 py-2 text-sm font-medium hover:bg-fg/5"
                        >
                            Manage subscription
                        </button>
                    </form>
                </section>
            ) : (
                <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <article className="space-y-3 rounded-lg border border-border-base p-6">
                        <h2 className="text-lg font-semibold">Monthly</h2>
                        <p className="text-3xl font-bold">
                            ${PRO_MONTHLY_PRICE_USD}
                            <span className="text-base font-normal text-muted">/mo</span>
                        </p>
                        <p className="text-xs text-muted">14-day free trial.</p>
                        <form action={startProCheckout.bind(null, 'monthly')}>
                            <button
                                type="submit"
                                className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
                            >
                                Start trial — monthly
                            </button>
                        </form>
                    </article>
                    <article className="space-y-3 rounded-lg border-2 border-primary p-6">
                        <h2 className="text-lg font-semibold">
                            Yearly{' '}
                            <span className="ml-1 rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                Save ${PRO_MONTHLY_PRICE_USD * 12 - PRO_YEARLY_PRICE_USD}
                            </span>
                        </h2>
                        <p className="text-3xl font-bold">
                            ${PRO_YEARLY_PRICE_USD}
                            <span className="text-base font-normal text-muted">/yr</span>
                        </p>
                        <p className="text-xs text-muted">14-day free trial.</p>
                        <form action={startProCheckout.bind(null, 'yearly')}>
                            <button
                                type="submit"
                                className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
                            >
                                Start trial — yearly
                            </button>
                        </form>
                    </article>
                </section>
            )}
        </section>
    );
}
