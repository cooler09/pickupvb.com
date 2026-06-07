import { redirect } from 'next/navigation';
import { primaryButtonClass } from '@/components/primary-button';
import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase';
import { isStripeConfigured } from '@/lib/stripe';
import { getHostSubscription, isPro, PRO_MONTHLY_PRICE_USD, PRO_YEARLY_PRICE_USD } from '@/lib/pro';
import { startProCheckout, getBillingPortalUrl } from './actions';
import { OpenInNewTabButton } from '@/components/open-in-new-tab-button';
import { SubmitButton } from '@/components/submit-button';
import { renderNowMs } from '@/lib/render-now';

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
  // Snapshot the wall clock at the page boundary so the trial-end check
  // below stays out of the React Compiler purity rule.
  const nowMs = renderNowMs();
  const trialActive = !!sub?.trial_end && new Date(sub.trial_end).getTime() > nowMs;

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-3 text-sm">
          <Link href="/profile/billing" className="text-primary hover:underline">
            ← Payouts
          </Link>
        </div>
        <h1 className="text-headline-lg font-bold">Pro Host</h1>
        <p className="text-muted">
          Upgrade for unlimited paid events, half the platform fee, saved templates, host analytics,
          sponsor slots, and more.
        </p>
      </header>

      {!isStripeConfigured() && (
        <div className="border-border-base bg-surface rounded-shape-sm border p-4 text-sm">
          Payments are not configured on this server.
        </div>
      )}

      {sp.status === 'success' && (
        <div className="rounded-shape-sm border-md-success/30 bg-md-success-container text-md-on-success-container border p-4 text-sm">
          Thanks! Your subscription is being activated — it usually shows as active within a few
          seconds.
        </div>
      )}
      {sp.error === 'anonymous' && (
        <div className="border-secondary bg-secondary/10 rounded-shape-sm border p-4 text-sm">
          You need a permanent account (with email) to subscribe.
        </div>
      )}
      {sp.error === 'no_customer' && (
        <div className="border-secondary bg-secondary/10 rounded-shape-sm border p-4 text-sm">
          No subscription yet. Start one below.
        </div>
      )}

      <section className="border-border-base rounded-shape-sm border p-6">
        <h2 className="text-title-lg font-semibold">What you get</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
          <li>
            <strong className="text-fg">Unlimited paid events.</strong> Free hosts are capped at 1
            paid event per 30 days.
          </li>
          <li>
            <strong className="text-fg">2.5% platform fee</strong> on tickets — half what free hosts
            pay. Tips are always fee-free for every host.
          </li>
          <li>
            <strong className="text-fg">Saved event templates.</strong> Save any event as a
            template; apply it when creating a new one to prefill date, venue, pricing, and
            description in one click.
          </li>
          <li>
            <strong className="text-fg">Host analytics dashboard.</strong> Fill rate,
            repeat-attendee rate, GMV trend, and a recent-events snapshot — all at{' '}
            <a href="/profile/billing/analytics" className="text-primary hover:underline">
              /profile/billing/analytics
            </a>
            .
          </li>
          <li>
            <strong className="text-fg">Sponsor slot included</strong> on every event. Add a local
            sponsor (logo, one-line message, optional discount code) at no extra charge. Free hosts
            pay $3 per event.
          </li>
          <li>
            <strong className="text-fg">Custom refund policy.</strong> Configure your own refund
            window (1 hour to 30 days) instead of the default.
          </li>
          <li>
            <strong className="text-fg">Invite-only / private events.</strong> Keep events off the
            public listing and share via direct link or invite.
          </li>
          <li>CSV attendee export with payment status.</li>
        </ul>
      </section>

      {active && sub ? (
        <section className="rounded-shape-sm border-md-success/30 bg-md-success-container/40 space-y-4 border p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-title-lg font-semibold">Pro {sub.plan ? `(${sub.plan})` : ''}</h2>
            <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white uppercase">
              {sub.status}
            </span>
          </div>
          {sub.trial_end && trialActive && (
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
          <article className="border-border-base rounded-shape-sm space-y-3 border p-6">
            <h2 className="text-lg font-semibold">Monthly</h2>
            <p className="text-headline-lg font-bold">
              ${PRO_MONTHLY_PRICE_USD}
              <span className="text-muted text-base font-normal">/mo</span>
            </p>
            <p className="text-muted text-xs">14-day free trial.</p>
            <form action={startProCheckout.bind(null, 'monthly')}>
              <SubmitButton
                className={`${primaryButtonClass('md')} w-full`}
                pendingChildren="Starting…"
              >
                Start trial — monthly
              </SubmitButton>
            </form>
          </article>
          <article className="border-primary rounded-shape-sm space-y-3 border-2 p-6">
            <h2 className="text-lg font-semibold">
              Yearly{' '}
              <span className="bg-primary/10 text-primary ml-1 rounded px-2 py-0.5 text-xs font-medium">
                Save ${PRO_MONTHLY_PRICE_USD * 12 - PRO_YEARLY_PRICE_USD}
              </span>
            </h2>
            <p className="text-headline-lg font-bold">
              ${PRO_YEARLY_PRICE_USD}
              <span className="text-muted text-base font-normal">/yr</span>
            </p>
            <p className="text-muted text-xs">14-day free trial.</p>
            <form action={startProCheckout.bind(null, 'yearly')}>
              <SubmitButton
                className={`${primaryButtonClass('md')} w-full`}
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
