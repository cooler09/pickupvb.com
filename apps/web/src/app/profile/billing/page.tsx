import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { getServerSupabase } from '@/lib/supabase';
import { getHostStripeAccountStatus } from '@/lib/host-stripe-account';
import { isStripeConfigured, PLATFORM_FEE_BPS } from '@/lib/stripe';
import { isPro, PRO_PLATFORM_FEE_BPS, PRO_MONTHLY_PRICE_USD } from '@/lib/pro';
import {
    startStripeOnboarding,
    openStripeDashboard,
    refreshStripeAccountStatus,
} from './actions';

export const dynamic = 'force-dynamic';
export const metadata = {
    title: 'Payouts — PickupVB',
    robots: { index: false, follow: false },
};

type SearchParams = Promise<{ onboarding?: string; error?: string }>;

export default async function BillingPage(props: { searchParams: SearchParams }) {
    const sp = await props.searchParams;

    const supabase = await getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/login?next=/profile/billing');

    if (sp.onboarding === 'complete') {
        await refreshStripeAccountStatus();
    }

    let account: Awaited<ReturnType<typeof getHostStripeAccountStatus>> = null;
    if (isStripeConfigured()) {
        account = await getHostStripeAccountStatus(user.id);
    }

    const ready = Boolean(account?.chargesEnabled && account.payoutsEnabled);
    const inProgress = Boolean(account && !ready);
    const pro = ready ? await isPro(user.id) : false;
    const feePct = ((pro ? PRO_PLATFORM_FEE_BPS : PLATFORM_FEE_BPS) / 100).toFixed(1);

    // Status pill content
    const statusPill = ready
        ? { label: '✓ Connected', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' }
        : inProgress
            ? { label: '⚠ Onboarding incomplete', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' }
            : isStripeConfigured()
                ? { label: 'Not connected', cls: 'bg-fg/10 text-muted' }
                : { label: 'Payments not configured', cls: 'bg-fg/10 text-muted' };

    return (
        <div className="mx-auto max-w-2xl space-y-6 py-4">
            {/* ── Header ──────────────────────────────────────────────── */}
            <div className="space-y-2">
                <Link
                    href={'/profile' as Route}
                    className="text-sm text-primary hover:underline"
                >
                    ← Profile
                </Link>
                <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-3xl font-bold">Payouts</h1>
                    <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${statusPill.cls}`}
                    >
                        {statusPill.label}
                    </span>
                </div>
                <p className="text-sm text-muted">
                    Connect a Stripe account to sell tickets or accept tips on
                    your events. Free pickups don&apos;t need this.
                </p>
            </div>

            {/* ── Error / config banners ──────────────────────────────── */}
            {!isStripeConfigured() && (
                <div className="rounded-lg border border-border-base bg-surface p-4 text-sm">
                    Payments are not configured on this server. Set{' '}
                    <code className="rounded bg-fg/10 px-1 py-0.5">
                        STRIPE_SECRET_KEY
                    </code>{' '}
                    in your environment to enable.
                </div>
            )}

            {sp.error === 'anonymous' && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200">
                    You need a permanent account (with email) to receive
                    payouts. Finish claiming your account first.
                </div>
            )}

            {/* ── PRIMARY STATE CARD ─────────────────────────────────── */}
            {isStripeConfigured() && !account && (
                <section className="space-y-3 rounded-lg border border-border-base bg-surface p-5">
                    <h2 className="text-lg font-semibold">Connect Stripe</h2>
                    <p className="text-sm text-muted">
                        Quick KYC on Stripe (~5 min). Funds arrive in your bank
                        within 2 business days of each ticket sale.
                    </p>
                    <ul className="ml-4 list-disc text-sm text-muted">
                        <li>Platform fee: <strong className="text-fg">5%</strong> per ticket (2.5% on Pro).</li>
                        <li>Stripe processing: ~2.9% + 30¢ per transaction.</li>
                    </ul>
                    <form action={startStripeOnboarding}>
                        <button
                            type="submit"
                            className="rounded-md bg-primary px-4 py-2 font-medium text-primary-fg hover:opacity-90"
                        >
                            Connect with Stripe →
                        </button>
                    </form>
                </section>
            )}

            {inProgress && account && (
                <section className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-5">
                    <h2 className="text-lg font-semibold">Finish onboarding</h2>
                    <p className="text-sm">
                        Stripe still needs a few details before you can accept
                        payments.
                    </p>
                    <ul className="grid gap-1 text-sm sm:grid-cols-3">
                        <li>
                            <span className="text-muted">Charges:</span>{' '}
                            <strong>{account.chargesEnabled ? 'yes' : 'no'}</strong>
                        </li>
                        <li>
                            <span className="text-muted">Payouts:</span>{' '}
                            <strong>{account.payoutsEnabled ? 'yes' : 'no'}</strong>
                        </li>
                        <li>
                            <span className="text-muted">Details:</span>{' '}
                            <strong>{account.detailsSubmitted ? 'yes' : 'no'}</strong>
                        </li>
                    </ul>
                    <form action={startStripeOnboarding}>
                        <button
                            type="submit"
                            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:opacity-90"
                        >
                            Continue onboarding →
                        </button>
                    </form>
                </section>
            )}

            {ready && (
                <>
                    {/* ── Quick actions: above-the-fold CTAs ──────────── */}
                    <section className="rounded-lg border border-border-base bg-surface p-5">
                        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                            Quick actions
                        </h2>
                        <div className="grid gap-2 sm:grid-cols-3">
                            <Link
                                href={'/profile/billing/earnings' as Route}
                                className="rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-primary-fg hover:opacity-90"
                            >
                                View earnings →
                            </Link>
                            <form action={openStripeDashboard} target="_blank">
                                <button
                                    type="submit"
                                    className="w-full rounded-md border border-border-base px-3 py-2 text-sm hover:bg-fg/5"
                                >
                                    Stripe dashboard ↗
                                </button>
                            </form>
                            <form action={refreshStripeAccountStatus}>
                                <button
                                    type="submit"
                                    className="w-full rounded-md border border-border-base px-3 py-2 text-sm hover:bg-fg/5"
                                >
                                    Refresh status
                                </button>
                            </form>
                        </div>
                    </section>

                    {/* ── Plan & fees ─────────────────────────────────── */}
                    <section className="rounded-lg border border-border-base bg-surface p-5">
                        <div className="flex items-baseline justify-between gap-3">
                            <h2 className="text-lg font-semibold">
                                Plan{' '}
                                <span className="ml-1 rounded-full bg-fg/10 px-2 py-0.5 text-xs font-medium text-muted">
                                    {pro ? 'Pro' : 'Standard'}
                                </span>
                            </h2>
                            {pro ? (
                                <Link
                                    href={'/profile/billing/pro' as Route}
                                    className="text-sm text-primary hover:underline"
                                >
                                    Manage subscription →
                                </Link>
                            ) : (
                                <Link
                                    href={'/profile/billing/pro' as Route}
                                    className="text-sm font-medium text-primary hover:underline"
                                >
                                    Upgrade to Pro →
                                </Link>
                            )}
                        </div>
                        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                            <div>
                                <dt className="text-xs uppercase tracking-wide text-muted">
                                    Platform fee
                                </dt>
                                <dd className="font-medium">{feePct}% per ticket</dd>
                            </div>
                            <div>
                                <dt className="text-xs uppercase tracking-wide text-muted">
                                    Stripe processing
                                </dt>
                                <dd className="font-medium">~2.9% + 30¢ per txn</dd>
                            </div>
                        </dl>
                        {!pro && (
                            <p className="mt-3 text-xs text-muted">
                                Pro is ${PRO_MONTHLY_PRICE_USD}/mo and cuts the
                                platform fee in half (5% → 2.5%).
                            </p>
                        )}
                    </section>

                    {/* ── Tax forms ───────────────────────────────────── */}
                    <section className="rounded-lg border border-border-base bg-surface p-5">
                        <h2 className="text-lg font-semibold">Tax forms (1099-K)</h2>
                        <p className="mt-2 text-sm text-muted">
                            Stripe (not PickupVB) issues your 1099-K. Forms post
                            to your Stripe dashboard in late January for the
                            prior calendar year.
                        </p>
                        <p className="mt-2 text-sm text-muted">
                            US federal threshold for tax year 2026:{' '}
                            <strong className="text-fg">$2,500</strong>. Some
                            states are lower (MA / VT / VA: $600). Stripe picks
                            the right one based on your address.
                        </p>
                        <form action={openStripeDashboard} target="_blank" className="mt-3">
                            <button
                                type="submit"
                                className="rounded-md border border-border-base px-4 py-2 text-sm hover:bg-fg/5"
                            >
                                Open tax forms in Stripe ↗
                            </button>
                        </form>
                        <p className="mt-2 text-xs text-muted">
                            Lands on your Express dashboard — click{' '}
                            <em>Tax forms</em> in the left nav.
                        </p>
                    </section>
                </>
            )}
        </div>
    );
}
