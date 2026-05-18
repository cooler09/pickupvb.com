import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Refund Policy',
  description: 'How refunds work for paid events and Pro Host subscriptions on PickupVB.',
};

const LAST_UPDATED = 'May 18, 2026';

export default function RefundsPage() {
  return (
    <>
      <h1>Refund Policy</h1>
      <p>
        <em>Last updated: {LAST_UPDATED}</em>
      </p>

      <p>
        <strong>Placeholder.</strong> Replace with finalized policy before launch.
      </p>

      <h2>Paid events</h2>
      <p>
        Each event lists its own refund window. By default, attendees can cancel and receive a full
        refund up to 24 hours before the event start time. After the refund window closes, refunds
        are at the host&apos;s discretion.
      </p>
      <p>If a host cancels an event, all paid attendees are refunded in full automatically.</p>

      <h2>Pro Host subscription</h2>
      <p>
        The Pro Host subscription includes a 14-day free trial. Cancel any time during the trial and
        you will not be charged. After the trial, the subscription renews automatically (monthly or
        yearly, depending on the plan you chose). You can cancel at any time from the billing
        portal; your Pro access continues through the end of the current billing period and does not
        renew.
      </p>

      <h2>Tips</h2>
      <p>
        Tips are voluntary contributions to hosts and are non-refundable except when the underlying
        event is cancelled by the host.
      </p>

      <h2>Disputes</h2>
      <p>
        Email <a href="mailto:support@pickupvb.com">support@pickupvb.com</a> with your receipt and
        we&apos;ll help resolve the issue.
      </p>
    </>
  );
}
