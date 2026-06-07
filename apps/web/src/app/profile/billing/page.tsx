import { redirect } from 'next/navigation';
import { primaryButtonClass } from '@/components/primary-button';
import Link from 'next/link';
import type { Route } from 'next';
import { getServerSupabase } from '@/lib/supabase';
import { getHostStripeAccountStatus } from '@/lib/host-stripe-account';
import { isStripeConfigured, PLATFORM_FEE_BPS } from '@/lib/stripe';
import { isPro, PRO_PLATFORM_FEE_BPS, PRO_MONTHLY_PRICE_USD } from '@/lib/pro';
import {
  startStripeOnboarding,
  getStripeDashboardUrl,
  refreshStripeAccountStatus,
} from './actions';
import { OpenInNewTabButton } from '@/components/open-in-new-tab-button';
import { SubmitButton } from '@/components/submit-button';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Payouts — PickupVB',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ onboarding?: string; error?: string }>;

const cardClass = 'border-border-base bg-md-surface-container rounded-shape-sm border p-5 sm:p-6';

type StepState = 'done' | 'current' | 'todo';

function ChecklistStep({
  index,
  state,
  title,
  description,
}: {
  index: number;
  state: StepState;
  title: string;
  description: string;
}) {
  const ring =
    state === 'done'
      ? 'bg-md-success/15 text-md-success ring-md-success/40'
      : state === 'current'
        ? 'bg-primary/10 text-primary ring-primary/40'
        : 'bg-fg/5 text-muted ring-border-base';
  const titleCls =
    state === 'done'
      ? 'text-muted line-through decoration-emerald-500/60'
      : state === 'current'
        ? 'text-fg font-semibold'
        : 'text-muted';
  return (
    <li className="flex gap-3">
      <span
        className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-1 ring-inset ${ring}`}
        aria-hidden="true"
      >
        {state === 'done' ? '✓' : index}
      </span>
      <div className="min-w-0">
        <p className={`text-sm ${titleCls}`}>{title}</p>
        <p className="text-muted text-xs">{description}</p>
      </div>
    </li>
  );
}

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

  // Three-step onboarding checklist state.
  const step1: StepState = account ? 'done' : 'current';
  const step2: StepState = account?.detailsSubmitted ? 'done' : account ? 'current' : 'todo';
  const step3: StepState = ready ? 'done' : account?.detailsSubmitted ? 'current' : 'todo';

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      {/* ── Breadcrumb + title ───────────────────────────────────── */}
      <div className="space-y-2">
        <Link href={'/profile' as Route} className="text-primary text-sm hover:underline">
          ← Profile
        </Link>
        <h1 className="text-fg text-headline-lg font-bold">Payouts</h1>
        <p className="text-muted text-sm">
          Connect Stripe to sell tickets or accept tips on your events. Free pickups don&apos;t need
          this.
        </p>
      </div>

      {/* ── Top-level error banners ──────────────────────────────── */}
      {!isStripeConfigured() && (
        <div className={`${cardClass} text-sm`}>
          Payments are not configured on this server. Set{' '}
          <code className="bg-fg/10 rounded px-1 py-0.5">STRIPE_SECRET_KEY</code> in your
          environment to enable.
        </div>
      )}

      {sp.error === 'anonymous' && (
        <div className="rounded-shape-sm border-md-warning/40 bg-md-warning/5 text-md-warning border p-4 text-sm">
          You need a permanent account (with email) to receive payouts. Finish claiming your account
          first.
        </div>
      )}

      {/* ── STATUS / CHECKLIST CARD ─────────────────────────────── */}
      {isStripeConfigured() && (
        <section className={`${cardClass} space-y-5`}>
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-fg text-lg font-semibold">
                {ready
                  ? 'Stripe connected'
                  : inProgress
                    ? 'Finish Stripe onboarding'
                    : 'Get set up to accept payments'}
              </h2>
              <p className="text-muted text-sm">
                {ready
                  ? 'You can sell tickets, accept tips, and receive payouts.'
                  : inProgress
                    ? 'Stripe still needs a few details before money can move.'
                    : 'Quick KYC on Stripe (~5 min). Payouts land 2 business days after each sale.'}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                ready
                  ? 'bg-md-success/15 text-md-success'
                  : inProgress
                    ? 'bg-md-warning/15 text-md-warning'
                    : 'bg-fg/10 text-muted'
              }`}
            >
              {ready ? '✓ Connected' : inProgress ? '⚠ In progress' : 'Not connected'}
            </span>
          </header>

          <ol className="space-y-3">
            <ChecklistStep
              index={1}
              state={step1}
              title="Create your Stripe account"
              description="We hand off to Stripe to verify your identity."
            />
            <ChecklistStep
              index={2}
              state={step2}
              title="Submit business details"
              description="Address, tax ID, and bank account on Stripe's form."
            />
            <ChecklistStep
              index={3}
              state={step3}
              title="Enable charges & payouts"
              description="Stripe flips both switches once verification clears."
            />
          </ol>

          {!ready && (
            <div className="border-border-base flex flex-wrap items-center gap-3 border-t pt-4">
              <form action={startStripeOnboarding}>
                <SubmitButton className={primaryButtonClass('md')} pendingChildren="Connecting…">
                  {inProgress ? 'Continue onboarding →' : 'Connect with Stripe →'}
                </SubmitButton>
              </form>
              {inProgress && (
                <form action={refreshStripeAccountStatus}>
                  <SubmitButton
                    className="border-border-base text-fg hover:bg-fg/5 rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-60"
                    pendingChildren="Refreshing…"
                  >
                    Refresh status
                  </SubmitButton>
                </form>
              )}
            </div>
          )}
        </section>
      )}

      {ready && (
        <>
          {/* ── Quick actions ─────────────────────────────────── */}
          <section className={cardClass}>
            <h2 className="text-muted mb-3 text-xs font-semibold tracking-wide uppercase">
              Quick actions
            </h2>
            <div className="grid gap-2 sm:grid-cols-4">
              <Link
                href={'/profile/billing/earnings' as Route}
                className={`${primaryButtonClass('md')} text-center`}
              >
                View earnings →
              </Link>
              <Link
                href={'/profile/billing/analytics' as Route}
                className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-2 text-center text-sm font-medium"
              >
                Host analytics →
              </Link>
              <OpenInNewTabButton
                getUrl={getStripeDashboardUrl}
                className="border-border-base hover:bg-fg/5 w-full rounded-md border px-3 py-2 text-sm"
                nullMessage="Finish Stripe onboarding first."
              >
                Stripe dashboard ↗
              </OpenInNewTabButton>
              <form action={refreshStripeAccountStatus}>
                <SubmitButton
                  className="border-border-base hover:bg-fg/5 w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
                  pendingChildren="Refreshing…"
                >
                  Refresh status
                </SubmitButton>
              </form>
            </div>
          </section>

          {/* ── Plan & fees ───────────────────────────────────── */}
          <section className={`${cardClass} space-y-3`}>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-fg text-lg font-semibold">
                Plan{' '}
                <span className="bg-fg/10 text-muted ml-1 rounded-full px-2 py-0.5 text-xs font-medium">
                  {pro ? 'Pro' : 'Standard'}
                </span>
              </h2>
              <Link
                href={'/profile/billing/pro' as Route}
                className="text-primary text-sm font-medium hover:underline"
              >
                {pro ? 'Manage subscription →' : 'Upgrade to Pro →'}
              </Link>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted text-xs tracking-wide uppercase">Platform fee</dt>
                <dd className="text-fg font-medium">{feePct}% per ticket</dd>
              </div>
              <div>
                <dt className="text-muted text-xs tracking-wide uppercase">Stripe processing</dt>
                <dd className="text-fg font-medium">~2.9% + 30¢ per txn</dd>
              </div>
            </dl>
            {!pro && (
              <p className="text-muted text-xs">
                Pro is ${PRO_MONTHLY_PRICE_USD}/mo and cuts the platform fee in half (5% → 2.5%).
              </p>
            )}
          </section>

          {/* ── Tax forms ─────────────────────────────────────── */}
          <section className={`${cardClass} space-y-3`}>
            <h2 className="text-fg text-lg font-semibold">Tax forms (1099-K)</h2>
            <p className="text-muted text-sm">
              Stripe (not PickupVB) issues your 1099-K. Forms post to your Stripe dashboard in late
              January for the prior calendar year.
            </p>
            <p className="text-muted text-sm">
              US federal threshold for tax year 2026: <strong className="text-fg">$2,500</strong>.
              Some states are lower (MA / VT / VA: $600). Stripe picks the right one based on your
              address.
            </p>
            <div>
              <OpenInNewTabButton
                getUrl={getStripeDashboardUrl}
                className="border-border-base hover:bg-fg/5 rounded-md border px-4 py-2 text-sm"
                nullMessage="Finish Stripe onboarding first."
              >
                Open tax forms in Stripe ↗
              </OpenInNewTabButton>
            </div>
            <p className="text-muted text-xs">
              Lands on your Express dashboard — click <em>Tax forms</em> in the left nav.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
