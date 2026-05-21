import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase';
import { isStripeConfigured } from '@/lib/stripe';
import { getHostSubscription, isPro, PRO_MONTHLY_PRICE_USD, PRO_YEARLY_PRICE_USD } from '@/lib/pro';
import { startProCheckout, getBillingPortalUrl } from './actions';
import { OpenInNewTabButton } from '@/components/open-in-new-tab-button';
import { SubmitButton } from '@/components/submit-button';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Pro Host — PickupVB',
  robots: { index: false, follow: false },
};

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
          Upgrade to unlock unlimited paid events, a lower platform fee, and CSV attendee exports.
        </p>
      </header>

      {!isStripeConfigured() && (
        <div className="border-border-base bg-surface rounded-lg border p-4 text-sm">
          Payments are not configured on this server.
        </div>
      )}

      {sp.status === 'success' && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">
          Thanks! Your subscription is being activated — it usually shows as active within a few
          seconds.
        </div>
      )}
      {sp.error === 'anonymous' && (
        <div className="border-secondary bg-secondary/10 rounded-lg border p-4 text-sm">
          You need a permanent account (with email) to subscribe.
        </div>
      )}
      {sp.error === 'no_customer' && (
        <div className="border-secondary bg-secondary/10 rounded-lg border p-4 text-sm">
          No subscription yet. Start one below.
        </div>
      )}

      <section className="border-border-base rounded-lg border p-6">
        <h2 className="text-xl font-semibold">Perks</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          <li>
            <strong className="text-fg">2.5%</strong> platform fee on paid events (free hosts pay
            5%).
          </li>
          <li>
            <strong className="text-fg">Unlimited paid events.</strong> Free hosts are capped at 1
            paid event per 30 days.
          </li>
          <li>CSV attendee export with payment status.</li>
        </ul>
      </section>

      {active && sub ? (
        <section className="space-y-4 rounded-lg border border-emerald-300 bg-emerald-50/40 p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold">Pro {sub.plan ? `(${sub.plan})` : ''}</h2>
            <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white uppercase">
              {sub.status}
            </span>
          </div>
          {sub.trial_end && new Date(sub.trial_end).getTime() > Date.now() && (
            <p className="text-muted text-sm">
              Trial ends <strong>{formatDate(sub.trial_end)}</strong>.
            </p>
          )}
          {sub.current_period_end && (
            <p className="text-muted text-sm">
              {sub.cancel_at_period_end ? 'Cancels' : 'Renews'} on{' '}
              <strong>{formatDate(sub.current_period_end)}</strong>.
            </p>
          )}
          <OpenInNewTabButton
            getUrl={getBillingPortalUrl}
            className="border-border-base bg-surface hover:bg-fg/5 rounded-md border px-4 py-2 text-sm font-medium"
          >
            Manage subscription ↗
          </OpenInNewTabButton>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <article className="border-border-base space-y-3 rounded-lg border p-6">
            <h2 className="text-lg font-semibold">Monthly</h2>
            <p className="text-3xl font-bold">
              ${PRO_MONTHLY_PRICE_USD}
              <span className="text-muted text-base font-normal">/mo</span>
            </p>
            <p className="text-muted text-xs">14-day free trial.</p>
            <form action={startProCheckout.bind(null, 'monthly')}>
              <SubmitButton
                className="bg-primary hover:bg-primary/90 w-full rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                pendingChildren="Starting…"
              >
                Start trial — monthly
              </SubmitButton>
            </form>
          </article>
          <article className="border-primary space-y-3 rounded-lg border-2 p-6">
            <h2 className="text-lg font-semibold">
              Yearly{' '}
              <span className="bg-primary/10 text-primary ml-1 rounded px-2 py-0.5 text-xs font-medium">
                Save ${PRO_MONTHLY_PRICE_USD * 12 - PRO_YEARLY_PRICE_USD}
              </span>
            </h2>
            <p className="text-3xl font-bold">
              ${PRO_YEARLY_PRICE_USD}
              <span className="text-muted text-base font-normal">/yr</span>
            </p>
            <p className="text-muted text-xs">14-day free trial.</p>
            <form action={startProCheckout.bind(null, 'yearly')}>
              <SubmitButton
                className="bg-primary hover:bg-primary/90 w-full rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                pendingChildren="Starting…"
              >
                Start trial — yearly
              </SubmitButton>
            </form>
          </article>
        </section>
      )}
    </section>
  );
}
