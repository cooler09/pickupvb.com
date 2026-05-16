import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { getServerSupabase } from '@/lib/supabase';
import { getHostStripeAccountStatus } from '@/lib/host-stripe-account';
import { isStripeConfigured } from '@/lib/stripe';
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

    // If they just returned from Stripe, sync the latest state before render.
    if (sp.onboarding === 'complete') {
        await refreshStripeAccountStatus();
    }

    let account: Awaited<ReturnType<typeof getHostStripeAccountStatus>> = null;
    if (isStripeConfigured()) {
        account = await getHostStripeAccountStatus(user.id);
    }

    const ready = account?.chargesEnabled && account.payoutsEnabled;
    const inProgress = account && !ready;

    return (
        <section className="space-y-6">
            <header className="space-y-2">
                <div className="flex items-center gap-3 text-sm">
                    <Link href="/profile" className="text-primary hover:underline">
                        ← Profile
                    </Link>
                </div>
                <h1 className="text-3xl font-bold">Payouts</h1>
                <p className="text-muted">
                    Connect a Stripe account to charge for events. PickupVB stays
                    free for hosts who only run free pickups — you only need this
                    if you want to sell tickets.
                </p>
            </header>

            {!isStripeConfigured() && (
                <div className="rounded-lg border border-border-base bg-surface p-4 text-sm">
                    Payments are not configured on this server yet. Set
                    <code className="mx-1 rounded bg-background px-1 py-0.5">
                        STRIPE_SECRET_KEY
                    </code>
                    in your environment to enable.
                </div>
            )}

            {sp.error === 'anonymous' && (
                <div className="rounded-lg border border-secondary bg-secondary/10 p-4 text-sm">
                    You need a permanent account (with email) to receive payouts.
                    Finish claiming your account first.
                </div>
            )}

            {isStripeConfigured() && !account && (
                <div className="space-y-4 rounded-lg border border-border-base p-6">
                    <h2 className="text-xl font-semibold">Connect Stripe</h2>
                    <p className="text-sm text-muted">
                        We use Stripe Connect to pay you out directly. You&apos;ll
                        complete a quick KYC form on Stripe&apos;s site (takes ~5
                        minutes) and funds will arrive in your bank within 2
                        business days of each ticket sale.
                    </p>
                    <p className="text-sm text-muted">
                        Platform fee: <strong className="text-fg">5%</strong> per
                        ticket. Stripe also charges ~2.9% + 30¢ per transaction.
                    </p>
                    <form action={startStripeOnboarding}>
                        <button
                            type="submit"
                            className="rounded-md bg-primary px-4 py-2 font-medium text-primary-fg hover:opacity-90"
                        >
                            Connect with Stripe →
                        </button>
                    </form>
                </div>
            )}

            {inProgress && account && (
                <div className="space-y-4 rounded-lg border border-highlight bg-highlight/20 p-6">
                    <h2 className="text-xl font-semibold text-highlight-fg">
                        Onboarding incomplete
                    </h2>
                    <p className="text-sm text-highlight-fg">
                        Stripe still needs a few more details before you can
                        accept payments. Pick up where you left off:
                    </p>
                    <ul className="ml-4 list-disc text-sm text-highlight-fg">
                        <li>
                            Charges enabled:{' '}
                            <strong>{account.chargesEnabled ? 'yes' : 'no'}</strong>
                        </li>
                        <li>
                            Payouts enabled:{' '}
                            <strong>{account.payoutsEnabled ? 'yes' : 'no'}</strong>
                        </li>
                        <li>
                            Details submitted:{' '}
                            <strong>{account.detailsSubmitted ? 'yes' : 'no'}</strong>
                        </li>
                    </ul>
                    <form action={startStripeOnboarding}>
                        <button
                            type="submit"
                            className="rounded-md bg-primary px-4 py-2 font-medium text-primary-fg hover:opacity-90"
                        >
                            Continue onboarding →
                        </button>
                    </form>
                </div>
            )}

            {ready && (
                <div className="space-y-4 rounded-lg border border-primary bg-primary/10 p-6">
                    <h2 className="text-xl font-semibold">Stripe connected</h2>
                    <p className="text-sm text-muted">
                        You&apos;re all set. Set a price on any event you create to
                        start selling tickets. Your Stripe Express dashboard
                        shows balance, payouts, and tax forms.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <form action={openStripeDashboard}>
                            <button
                                type="submit"
                                className="rounded-md bg-primary px-4 py-2 font-medium text-primary-fg hover:opacity-90"
                            >
                                Open Stripe dashboard →
                            </button>
                        </form>
                        <Link
                            href={'/profile/billing/earnings' as Route}
                            className="rounded-md border border-border-base px-4 py-2 hover:bg-surface"
                        >
                            View earnings →
                        </Link>
                        <form action={refreshStripeAccountStatus}>
                            <button
                                type="submit"
                                className="rounded-md border border-border-base px-4 py-2 hover:bg-surface"
                            >
                                Refresh status
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {ready && (
                <div className="space-y-3 rounded-lg border border-border-base p-6">
                    <h2 className="text-xl font-semibold">Tax forms (1099-K)</h2>
                    <p className="text-sm text-muted">
                        Stripe is the payment processor and issues your 1099-K
                        directly — PickupVB does not file tax forms for you.
                        Forms are typically posted to your Stripe dashboard in
                        late January for the prior calendar year.
                    </p>
                    <p className="text-sm text-muted">
                        US federal threshold for tax year 2026 is{' '}
                        <strong className="text-fg">$2,500</strong> in gross
                        payments. State thresholds may be lower (e.g. MA, VT,
                        VA at $600). Stripe applies the appropriate threshold
                        automatically based on your address.
                    </p>
                    <form action={openStripeDashboard}>
                        <button
                            type="submit"
                            className="rounded-md border border-border-base px-4 py-2 text-sm hover:bg-surface"
                        >
                            Open tax forms in Stripe →
                        </button>
                    </form>
                    <p className="text-xs text-muted">
                        Lands on your Stripe Express dashboard — click{' '}
                        <em>Tax forms</em> in the left nav.
                    </p>
                </div>
            )}
        </section>
    );
}
