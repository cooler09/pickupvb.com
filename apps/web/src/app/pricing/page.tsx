import Link from 'next/link';
import { primaryButtonClass, secondaryButtonClass } from '@/components/primary-button';
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

export const metadata = {
  title: 'Pricing',
  description:
    'PickupVB is free for hosts who run free events. Upgrade to Pro for unlimited paid events, half the platform fee, saved templates, analytics, sponsor slots, and more.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'Pricing · PickupVB',
    description:
      'Free for free events. Pro for unlimited paid events, lower fees, and the full host toolkit.',
    url: '/pricing',
    type: 'website',
  },
};

const FREE_TIER_FEATURES = [
  'Unlimited free events',
  `${FREE_PAID_EVENT_CAP_30D} paid event per 30 days (rolling)`,
  '5% platform fee on tickets — never any fee on tips',
  'Sponsor slot — $3/event à-la-carte',
  'Standalone tournament bracket — 1 active at a time',
  'Group pages, co-hosts, free-agent signups',
  'Event check-in & roster management',
];

const PRO_TIER_FEATURES = [
  'Unlimited paid events',
  '2.5% platform fee on tickets (half of free) — never any fee on tips',
  'Unlimited standalone tournament brackets',
  'Saved event templates — publish new dates in one click',
  'Host analytics — fill rate, GMV trend, repeat-attendee rate',
  'Sponsor slot included on every event',
  'Custom refund policy (1 hour to 30 days)',
  'Invite-only / private events',
  'CSV attendee export with payment status',
  '14-day free trial — cancel anytime',
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
          PickupVB is free for hosts who run free events. Upgrade to Pro for unlimited paid events,
          half the platform fee, templates, analytics, and the full host toolkit.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* ---- Free tier ---- */}
        <article className="border-border-base bg-surface rounded-shape-sm flex flex-col gap-4 border p-6">
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
            <Link href={'/events/new' as Route} className={`${secondaryButtonClass('md')} w-full`}>
              Host a free event
            </Link>
          </div>
        </article>

        {/* ---- Pro tier ---- */}
        <article className="border-primary bg-surface rounded-shape-sm flex flex-col gap-4 border-2 p-6 shadow-sm">
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
                  className={`${primaryButtonClass('md')} w-full text-center`}
                >
                  Sign in to start free trial
                </Link>
                <p className="text-muted text-center text-xs">14-day free trial. Cancel anytime.</p>
              </>
            ) : isAnon ? (
              <Link
                href={'/claim' as Route}
                className={`${primaryButtonClass('md')} w-full text-center`}
              >
                Finish creating your account
              </Link>
            ) : active ? (
              <>
                <OpenInNewTabButton
                  getUrl={getBillingPortalUrl}
                  className={`${secondaryButtonClass('md')} w-full`}
                >
                  Manage subscription ↗
                </OpenInNewTabButton>
                <p className="text-center text-xs text-emerald-700">
                  You&apos;re on Pro — thanks for supporting PickupVB.
                </p>
              </>
            ) : (
              <>
                <form action={startProCheckout.bind(null, 'monthly')}>
                  <SubmitButton
                    className={`${secondaryButtonClass('md')} w-full`}
                    pendingChildren="Starting…"
                  >
                    Start trial — ${PRO_MONTHLY_PRICE_USD}/mo
                  </SubmitButton>
                </form>
                <form action={startProCheckout.bind(null, 'yearly')}>
                  <SubmitButton
                    className={`${primaryButtonClass('md')} w-full`}
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
        <div className="border-border-base rounded-shape-sm overflow-x-auto border">
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
              <Row label="Platform fee — tickets" free="5%" pro="2.5%" />
              <Row label="Platform fee — tips" free="None" pro="None" />
              <Row label="Stripe processing fee" free="~2.9% + 30¢" pro="~2.9% + 30¢" />
              <Row label="Saved event templates" free="—" pro="✓" />
              <Row label="Host analytics dashboard" free="—" pro="✓" />
              <Row label="Sponsor slot" free="$3 / event" pro="Included" />
              <Row label="Standalone tournament brackets" free="1 at a time" pro="Unlimited" />
              <Row label="Custom refund policy" free="—" pro="✓" />
              <Row label="Private / invite-only events" free="—" pro="✓" />
              <Row label="CSV attendee export" free="—" pro="✓" />
              <Row label="Co-hosts & group pages" free="✓" pro="✓" />
              <Row label="Event check-in & roster" free="✓" pro="✓" />
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
          a="No. Free events have no platform fee and no subscription required. You also get co-hosts, group pages, waitlists, broadcasts, and check-in tools at no cost."
        />
        <Faq
          q={`What does "${FREE_PAID_EVENT_CAP_30D} paid event per 30 days" actually mean?`}
          a={`Free hosts can have ${FREE_PAID_EVENT_CAP_30D} paid event active in any rolling 30-day window. If you create a paid event today, you can create another one 30 days from today — not at the start of the next calendar month. Cancelling a paid event before it runs doesn't free up the slot. Upgrade to Pro for unlimited paid events.`}
        />
        <Faq
          q="How does the platform fee work?"
          a="Buyers pay the ticket price plus the platform fee (5% on Free, 2.5% on Pro) unless you choose to absorb it in your event settings. Tips are different — PickupVB never takes a fee on tips, so 100% reaches the host. Stripe's processing fee (~2.9% + 30¢) always comes out of your payout on any charge — it goes to Stripe, not PickupVB."
        />
        <Faq
          q="What are event templates?"
          a="Pro hosts can save any event as a template and apply it when creating a new one — the title, venue, format, pricing, and description all prefill. Change the date and publish. Useful for recurring open play sessions, weekly leagues, or annual tournaments."
        />
        <Faq
          q="What does the sponsor slot do?"
          a="You can add one sponsor block per event — your local sporting-goods store, gym, or brewery. It shows a logo, a one-line message, and an optional discount code below the event details. Pro hosts get it included; free hosts can unlock it for $3 per event."
        />
        <Faq
          q="How many tournament brackets can I run?"
          a="Standalone brackets (run a tournament without hosting a full event) are capped at 1 active bracket at a time on Free — once you finish or delete it, you can start another, and completed brackets you keep for history don't count. Pro hosts run unlimited brackets at once. The bracket tool built into a paid or free event is always unlimited and unaffected."
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
    <details className="group border-border-base bg-surface rounded-shape-sm border p-4">
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
