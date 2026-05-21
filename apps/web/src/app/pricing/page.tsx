import Link from 'next/link';
import type { Route } from 'next';
import { getServerSupabase } from '@/lib/supabase';
import { isStripeConfigured } from '@/lib/stripe';
import {
  isPro,
  PRO_MONTHLY_PRICE_USD,
  PRO_YEARLY_PRICE_USD,
  FREE_PAID_EVENT_CAP_30D,
} from '@/lib/pro';
import { startProCheckout, getBillingPortalUrl } from '@/app/profile/billing/pro/actions';
import { OpenInNewTabButton } from '@/components/open-in-new-tab-button';
import { SubmitButton } from '@/components/submit-button';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Pricing',
  description:
    'PickupVB is free for hosts who run free pickup events. Upgrade to Pro for unlimited paid events, a lower platform fee, and host tools.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'Pricing · PickupVB',
    description: 'Free for free events. Pro for unlimited paid events and a lower platform fee.',
    url: '/pricing',
    type: 'website',
  },
};

const FREE_TIER_FEATURES = [
  'Unlimited free events',
  `${FREE_PAID_EVENT_CAP_30D} paid event every 30 days (rolling)`,
  '5% platform fee on paid tickets',
  'Tip jar (5% platform fee)',
  'Group pages, co-hosts, free-agent signups',
  'Event check-in & roster management',
];

const PRO_TIER_FEATURES = [
  'Unlimited paid events',
  '2.5% platform fee on paid tickets (half of free)',
  '2.5% platform fee on tips',
  'CSV attendee export with payment status',
  '14-day free trial — cancel anytime',
  'Everything in Free',
];

export default async function PricingPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAnon = Boolean(user && (user as { is_anonymous?: boolean }).is_anonymous);
  const isRealUser = Boolean(user) && !isAnon;
  const stripeReady = isStripeConfigured();
  const active = isRealUser && stripeReady && user ? await isPro(user.id) : false;

  const yearlySavings = PRO_MONTHLY_PRICE_USD * 12 - PRO_YEARLY_PRICE_USD;

  return (
    <section className="space-y-10">
      <header className="mx-auto max-w-2xl space-y-3 text-center">
        <h1 className="text-4xl font-bold">Simple, host-friendly pricing</h1>
        <p className="text-muted">
          PickupVB stays free for hosts who only run free pickup events. Upgrade to Pro when you
          start charging for tickets and want a lower platform fee.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* ---- Free tier ---- */}
        <article className="border-border-base bg-surface flex flex-col gap-4 rounded-lg border p-6">
          <div>
            <h2 className="text-xl font-semibold">Free</h2>
            <p className="text-muted mt-1 text-sm">For casual hosts and free pickups.</p>
          </div>
          <p className="text-4xl font-bold">
            $0<span className="text-muted ml-1 text-base font-normal">/forever</span>
          </p>
          <ul className="space-y-2 text-sm">
            {FREE_TIER_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <span aria-hidden className="text-primary mt-0.5">
                  ✓
                </span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-2">
            <Link
              href={'/events/new' as Route}
              className="border-border-base bg-surface hover:bg-fg/5 inline-block w-full rounded-md border px-4 py-2 text-center text-sm font-medium"
            >
              Host a free event
            </Link>
          </div>
        </article>

        {/* ---- Pro tier ---- */}
        <article className="border-primary bg-surface flex flex-col gap-4 rounded-lg border-2 p-6 shadow-sm">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold">Pro Host</h2>
            <span className="bg-primary/10 text-primary rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase">
              Recommended
            </span>
          </div>
          <p className="text-muted text-sm">
            For organizers who run paid leagues, clinics, or ticketed tournaments.
          </p>
          <div className="flex items-baseline gap-3">
            <p className="text-4xl font-bold">
              ${PRO_MONTHLY_PRICE_USD}
              <span className="text-muted ml-1 text-base font-normal">/mo</span>
            </p>
            <p className="text-muted text-sm">
              or <strong className="text-fg">${PRO_YEARLY_PRICE_USD}/yr</strong>{' '}
              <span className="text-primary">(save ${yearlySavings})</span>
            </p>
          </div>
          <ul className="space-y-2 text-sm">
            {PRO_TIER_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <span aria-hidden className="text-primary mt-0.5">
                  ✓
                </span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div className="mt-auto space-y-2 pt-2">
            {!stripeReady ? (
              <p className="border-border-base bg-background text-muted rounded-md border p-3 text-xs">
                Payments aren&apos;t configured on this server yet.
              </p>
            ) : !user ? (
              <>
                <Link
                  href={'/login?next=/pricing' as Route}
                  className="bg-primary hover:bg-primary/90 inline-block w-full rounded-md px-4 py-2 text-center text-sm font-semibold text-white"
                >
                  Sign in to start free trial
                </Link>
                <p className="text-muted text-center text-xs">14-day free trial. Cancel anytime.</p>
              </>
            ) : isAnon ? (
              <Link
                href={'/claim' as Route}
                className="bg-primary hover:bg-primary/90 inline-block w-full rounded-md px-4 py-2 text-center text-sm font-semibold text-white"
              >
                Finish creating your account
              </Link>
            ) : active ? (
              <>
                <OpenInNewTabButton
                  getUrl={getBillingPortalUrl}
                  className="border-border-base bg-surface hover:bg-fg/5 w-full rounded-md border px-4 py-2 text-sm font-medium"
                >
                  Manage subscription ↗
                </OpenInNewTabButton>
                <p className="text-center text-xs text-emerald-700">
                  You&apos;re on Pro — thanks for supporting PickupVB.
                </p>
              </>
            ) : (
              <>
                <form
                  action={startProCheckout.bind(null, 'monthly')}
                  className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                >
                  <SubmitButton
                    className="border-primary bg-surface text-primary hover:bg-primary/10 rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-60"
                    pendingChildren="Starting…"
                  >
                    Start trial — ${PRO_MONTHLY_PRICE_USD}/mo
                  </SubmitButton>
                </form>
                <form action={startProCheckout.bind(null, 'yearly')}>
                  <SubmitButton
                    className="bg-primary hover:bg-primary/90 w-full rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    pendingChildren="Starting…"
                  >
                    Start trial — ${PRO_YEARLY_PRICE_USD}/yr (save ${yearlySavings})
                  </SubmitButton>
                </form>
                <p className="text-muted text-center text-xs">14-day free trial. Cancel anytime.</p>
              </>
            )}
          </div>
        </article>
      </div>

      {/* ---- Side-by-side comparison ---- */}
      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Compare tiers</h2>
        <div className="border-border-base overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-fg/5 text-left">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Feature
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Free
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Pro
                </th>
              </tr>
            </thead>
            <tbody className="divide-border-base divide-y">
              <Row label="Free events" free="Unlimited" pro="Unlimited" />
              <Row
                label="Paid events / 30 days"
                free={`${FREE_PAID_EVENT_CAP_30D} (rolling window)`}
                pro="Unlimited"
              />
              <Row label="Platform fee — ticket sales" free="5%" pro="2.5%" />
              <Row label="Platform fee — tips" free="5%" pro="2.5%" />
              <Row label="Stripe processing fee" free="~2.9% + 30¢" pro="~2.9% + 30¢" />
              <Row label="Tip jar" free="✓" pro="✓" />
              <Row label="Co-hosts & group pages" free="✓" pro="✓" />
              <Row label="CSV attendee export" free="—" pro="✓" />
            </tbody>
          </table>
        </div>
        <p className="text-muted text-xs">
          Stripe&apos;s processing fee (~2.9% + 30¢ per charge) is deducted from the host&apos;s
          payout regardless of tier — it goes to Stripe, not PickupVB.
        </p>
      </section>

      {/* ---- FAQ ---- */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">FAQ</h2>
        <Faq
          q="Do I need to pay to host free events?"
          a="No. Free events have no platform fee and no subscription required."
        />
        <Faq
          q={`What does "${FREE_PAID_EVENT_CAP_30D} paid event every 30 days" actually mean?`}
          a={`Free hosts can have ${FREE_PAID_EVENT_CAP_30D} paid event in any rolling 30-day window. If you create a paid event today, you'll be able to create another one 30 days from today — not at the start of the next calendar month. Cancelling a paid event before it runs doesn't free up the slot. Upgrade to Pro for unlimited paid events.`}
        />
        <Faq
          q="How does the platform fee work?"
          a={`Buyers pay the ticket price plus the platform fee (5% on Free, 2.5% on Pro) unless you choose to absorb it in your event settings. Stripe's processing fee always comes out of your payout.`}
        />
        <Faq
          q="What happens after the 14-day trial?"
          a="We auto-charge the plan you picked ($10/mo or $100/yr). Cancel anytime from the billing portal — you'll keep Pro access until the end of the period you've already paid for."
        />
        <Faq
          q="Can I switch between monthly and yearly?"
          a="Yes — open Manage subscription on the Pro page and pick the other plan. Stripe prorates the change."
        />
        <Faq
          q="What if I cancel?"
          a="You drop back to Free. Existing paid events stay published; new paid events you create after canceling count against the free-tier cap."
        />
      </section>
    </section>
  );
}

function Row({ label, free, pro }: { label: string; free: string; pro: string }) {
  return (
    <tr>
      <td className="px-4 py-2 font-medium">{label}</td>
      <td className="text-muted px-4 py-2">{free}</td>
      <td className="px-4 py-2">{pro}</td>
    </tr>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="group border-border-base bg-surface rounded-lg border p-4">
      <summary className="cursor-pointer list-none text-sm font-semibold">
        <span className="text-primary mr-2 inline-block transition-transform group-open:rotate-90">
          ›
        </span>
        {q}
      </summary>
      <p className="text-muted mt-2 pl-5 text-sm">{a}</p>
    </details>
  );
}
