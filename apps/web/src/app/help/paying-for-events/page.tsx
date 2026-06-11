import Link from 'next/link';
import type { Route } from 'next';
import { guideMetadata } from '../help-meta';
import { GuidePage } from '../_components/guide-page';

export const metadata = guideMetadata('paying-for-events');

export default function PayingForEventsGuide() {
  return (
    <GuidePage slug="paying-for-events">
      <p>
        Plenty of events are free. When one isn&rsquo;t, here&rsquo;s what to expect at checkout and
        how refunds, tips, and passes work.
      </p>

      <h2>Checking out</h2>
      <p>
        When you sign up for a paid event, you&rsquo;re taken to a secure <strong>Stripe</strong>{' '}
        checkout page to pay. Your spot is held while you finish, and you&rsquo;re confirmed as soon
        as the payment goes through — no need to message the host. PickupVB never sees your card
        details.
      </p>

      <h2>What you pay</h2>
      <p>
        You always see the full total before you pay. Depending on how the host set things up, a
        small service fee may show as a separate line item, or it may already be baked into the
        ticket price — either way the checkout total is what you&rsquo;re charged.
      </p>

      <h2>Refunds when you leave</h2>
      <p>
        Each paid event has a <strong>refund window</strong> set by the host. If you leave the event
        within that window, you&rsquo;re refunded <strong>automatically</strong> and your spot opens
        up for someone else. Leave after the window closes and a refund is up to the host&rsquo;s
        discretion. The event page shows the window before you commit.
      </p>

      <h2>Tipping the host</h2>
      <p>
        Most events have an optional <strong>tip jar</strong> if you want to show some love to the
        organizer. Tips are entirely optional, and the host receives essentially all of it —
        PickupVB takes no cut of tips.
      </p>

      <h2>Passes &amp; memberships</h2>
      <p>Some hosts sell ways to skip per-event payment:</p>
      <ul>
        <li>
          <strong>Session passes</strong> — buy a pack of credits once, then redeem one per session
          on the host&rsquo;s open-play events. Eligible events show a &ldquo;use a pass
          credit&rdquo; option, and cancelling returns the credit.
        </li>
        <li>
          <strong>Memberships</strong> — a monthly subscription that lets you claim a free spot on
          the host&rsquo;s open-play events while it&rsquo;s active.
        </li>
      </ul>
      <p>
        Your passes, credits, and memberships live in your profile, where you can also cancel a
        membership.
      </p>

      <h2>Next steps</h2>
      <ul>
        <li>
          New here? Start with{' '}
          <Link href={'/help/find-and-join' as Route}>Find a game and join</Link>.
        </li>
        <li>
          Signing up with teammates?{' '}
          <Link href={'/help/teams-and-free-agents' as Route}>Play on a team</Link>.
        </li>
      </ul>
    </GuidePage>
  );
}
