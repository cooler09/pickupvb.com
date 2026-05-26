import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Refund Policy',
  description: 'How refunds work for paid events and Pro Host subscriptions on PickupVB.',
};

const LAST_UPDATED = 'May 18, 2026';
const COMPANY = 'Zachary Lockhart Consulting, LLC';
const BRAND = 'PickupVB';
const CONTACT_EMAIL = 'support@pickupvb.com';
const DEFAULT_REFUND_WINDOW_HOURS = 24;
const TRIAL_DAYS = 14;

export default function RefundsPage() {
  return (
    <>
      <h1>Refund Policy</h1>
      <p>
        <em>Last updated: {LAST_UPDATED}</em>
      </p>

      <p>
        This Refund Policy describes when and how refunds are issued on the {BRAND} service,
        operated by {COMPANY}. It is part of our <a href="/legal/terms">Terms of Service</a>.
      </p>

      <h2>1. Overview</h2>
      <p>
        {BRAND} provides the platform that connects Hosts and Attendees. Hosts are the seller of
        record for the events they list. {BRAND} processes refunds on a Host&apos;s behalf when
        required by this policy or by the Host&apos;s own published policy.
      </p>

      <h2>2. Paid event tickets</h2>
      <p>
        Each event may display a Host-specific refund policy on its listing page. In the absence of
        a Host-specific policy, the following defaults apply:
      </p>
      <ul>
        <li>
          <strong>Default refund window.</strong> Attendees may cancel and receive a full refund,
          less non-recoverable payment processing fees, up to {DEFAULT_REFUND_WINDOW_HOURS} hours
          before the event start time.
        </li>
        <li>
          <strong>After the refund window.</strong> Cancellations made within{' '}
          {DEFAULT_REFUND_WINDOW_HOURS} hours of the event start are non-refundable, except at the
          Host&apos;s discretion.
        </li>
        <li>
          <strong>Host-set policies.</strong> A Pro Host may configure a different refund window
          (between 0 and 720 hours before event start). Hosts on the Free tier use the{' '}
          {DEFAULT_REFUND_WINDOW_HOURS}-hour default. Any Host-set policy is displayed on the event
          page before checkout and supersedes the default.
        </li>
      </ul>

      <h2>3. Host-cancelled or materially changed events</h2>
      <p>
        If a Host cancels an event, all paid Attendees receive an automatic full refund. If a Host
        materially changes an event (for example, by significantly changing the date, time, or
        location), Attendees may request a full refund regardless of the refund window by emailing{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> within 7 days of the change.
      </p>

      <h2>4. No-shows and late arrivals</h2>
      <p>
        Attendees who do not show up, who arrive after the cut-off communicated by the Host, or who
        are removed from an event for violating the Host&apos;s posted rules or our{' '}
        <a href="/legal/terms">Terms of Service</a> are not eligible for a refund.
      </p>

      <h2>5. Weather, safety, and force majeure</h2>
      <p>
        If an event is cancelled because of unsafe weather, venue closure, or another force majeure
        event, the Host should cancel the event in the Service, which triggers automatic refunds. If
        the Host postpones rather than cancels, you may choose to keep your registration for the
        rescheduled date or request a refund.
      </p>

      <h2>6. Pro Host subscription</h2>
      <ul>
        <li>
          <strong>Free trial.</strong> Eligible new subscribers receive a {TRIAL_DAYS}-day free
          trial. You will not be charged during the trial. Cancel before the trial ends and you will
          not be billed.
        </li>
        <li>
          <strong>Automatic renewal.</strong> After the trial, your subscription renews
          automatically at the then-current price for the plan you selected (monthly or annual)
          until you cancel.
        </li>
        <li>
          <strong>Cancellation.</strong> You may cancel at any time from your billing settings or
          via the Stripe Billing Portal link in your Account. Cancellation takes effect at the end
          of the current billing period and you retain Pro access until then.
        </li>
        <li>
          <strong>No partial-period refunds.</strong> Subscription fees are non-refundable for
          partial billing periods, except where required by law or as described below.
        </li>
        <li>
          <strong>Annual plans &mdash; first-period refund.</strong> If you purchase an annual Pro
          plan and request a refund within 7 days of the initial charge, we will issue a full
          refund. Renewals of an annual plan are not eligible for this 7-day window.
        </li>
        <li>
          <strong>California subscribers.</strong> California residents may cancel by emailing{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>; we will process cancellation
          within 30 days, in accordance with the California Automatic Renewal Law.
        </li>
      </ul>

      <h2>7. Tips</h2>
      <p>
        Tips are voluntary contributions to a Host. Tips are non-refundable except when the
        underlying event is cancelled by the Host or by {BRAND}.
      </p>

      <h2>8. How to request a refund</h2>
      <ol>
        <li>
          For event tickets within the refund window, cancel your RSVP from the event page. The
          refund is initiated automatically.
        </li>
        <li>For subscriptions, cancel from your billing settings or the Stripe Billing Portal.</li>
        <li>
          For anything outside the above &mdash; including Host-cancelled events that were not
          auto-refunded, materially changed events, duplicate charges, or unauthorized charges
          &mdash; email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with your account
          email, the event or invoice in question, and the reason for the request.
        </li>
      </ol>

      <h2>9. Processing time</h2>
      <p>
        Approved refunds are issued to the original payment method via Stripe. Most refunds appear
        within 5&ndash;10 business days, depending on your card issuer or bank. Currency-conversion
        fees and small processing fees may not be recoverable.
      </p>

      <h2>10. Chargebacks</h2>
      <p>
        Please contact <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> before initiating a
        chargeback with your card issuer &mdash; we can almost always resolve the issue faster.
        Accounts that initiate chargebacks instead of using the refund process may be suspended.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions about a refund? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
      <p>
        <strong>{COMPANY}</strong>
      </p>
    </>
  );
}
