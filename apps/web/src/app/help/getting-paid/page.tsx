import Link from 'next/link';
import type { Route } from 'next';
import { guideMetadata } from '../help-meta';
import { GuidePage } from '../_components/guide-page';

export const metadata = guideMetadata('getting-paid');

// HowTo steps for the structured data — concise summaries of the <h2> sections
// below. Keep in sync with the headings when the guide changes.
const HOW_TO_STEPS = [
  {
    name: 'Connect Stripe first',
    text: 'Connect a Stripe account from your billing settings before you can charge for an event.',
  },
  {
    name: 'Decide who pays the platform fee',
    text: 'Buyers pay the ticket price plus the platform fee (5% on Free, 2.5% on Pro) unless you choose to absorb it in your event settings.',
  },
  {
    name: 'Take tips fee-free',
    text: 'PickupVB never takes a fee on tips, so 100% of a tip reaches the host.',
  },
  {
    name: 'Handle refunds',
    text: 'Refunds are issued through Stripe; the processing fee on the original charge is not returned.',
  },
  {
    name: 'Get your payout',
    text: 'Stripe pays your balance out on its normal schedule, minus its processing fee on each charge.',
  },
  {
    name: 'Optionally pay out to a club',
    text: "With PickupVB Club, route an event's payout to a group's shared Stripe account instead of your own.",
  },
  {
    name: 'Sell passes and memberships (Pro)',
    text: 'Pro hosts can sell prepaid session passes and recurring memberships so attendees sign up to open plays without paying each time.',
  },
];

export default function GettingPaidGuide() {
  return (
    <GuidePage slug="getting-paid" howToSteps={HOW_TO_STEPS}>
      <p>
        PickupVB uses Stripe to move money straight from the buyer to you — the platform never holds
        your funds. Free events need none of this; set it up when you want to charge.
      </p>

      <h2>Connect Stripe first</h2>
      <p>
        Before you can publish a <strong>paid</strong> event, connect a Stripe account. It&rsquo;s a
        short Stripe-hosted onboarding (a few details about you or your business and where payouts
        land). The new-event form links you straight to it if you haven&rsquo;t finished yet, and
        you can also start from your{' '}
        <Link href={'/profile/billing' as Route}>billing settings</Link>. Once Stripe says
        you&rsquo;re ready to accept charges, you can publish paid events.
      </p>

      <h2>Who pays the platform fee</h2>
      <p>
        PickupVB charges a small platform fee on ticket sales (Pro hosts pay half the standard
        rate). When you create a paid event you choose how it&rsquo;s handled:
      </p>
      <ul>
        <li>
          <strong>Buyer pays the fee</strong> (default) — the fee is added as a separate line item
          at checkout, so you receive the full ticket price.
        </li>
        <li>
          <strong>You absorb the fee</strong> — the buyer pays only the ticket price and the fee
          comes out of your payout.
        </li>
      </ul>
      <p>
        For the current rates and what a Pro subscription unlocks, see{' '}
        <Link href={'/pricing' as Route}>Pricing</Link>.
      </p>

      <h2>Tips are always fee-free</h2>
      <p>
        Every event has an optional tip jar. PickupVB takes <strong>no</strong> platform fee on tips
        on any plan — the whole tip reaches you, less only Stripe&rsquo;s processing fee. Tip totals
        are hidden from you so gratuity stays the attendee&rsquo;s call.
      </p>

      <h2>Refunds</h2>
      <p>
        Each paid event has a <strong>refund window</strong> (you set the hours; the default is 24).
        If an attendee leaves within that window, they&rsquo;re refunded automatically. Outside the
        window, you decide whether to refund them manually. When a refund goes through, the spot is
        released back to the pool.
      </p>

      <h2>Getting your payout</h2>
      <p>
        Money is sent through Stripe to your connected account on Stripe&rsquo;s normal payout
        schedule — PickupVB is never in the middle. You can review your earnings and receipts from
        your profile.
      </p>

      <h2>Paying out to a club instead of yourself</h2>
      <p>
        Running events under a club, league, or venue? A group on the <strong>Club</strong> plan can
        connect its own Stripe account and have its events pay out to the club rather than to you
        personally. You opt an event in per event (while the price is still unlocked), and a club
        admin manages the payout account from the group&rsquo;s billing page. See{' '}
        <Link href={'/pricing' as Route}>Pricing</Link> for what Club includes.
      </p>

      <h2>Selling passes &amp; memberships (Pro)</h2>
      <p>
        Pro hosts can sell <strong>session passes</strong> (a prepaid pack of credits an attendee
        redeems per open-play session) and <strong>monthly memberships</strong> (an active member
        claims a free spot on your open-play events). Both route to you exactly like a ticket. Set
        them up from your billing settings once you&rsquo;re on Pro.
      </p>

      <h2>Next steps</h2>
      <ul>
        <li>
          New to hosting? Start with{' '}
          <Link href={'/help/getting-started' as Route}>Host your first event</Link>.
        </li>
        <li>
          Running competition? See{' '}
          <Link href={'/help/tournaments-and-brackets' as Route}>Run a tournament</Link>.
        </li>
      </ul>
    </GuidePage>
  );
}
