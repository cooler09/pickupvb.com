import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms that govern your use of PickupVB.',
};

const LAST_UPDATED = 'May 18, 2026';

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p>
        <em>Last updated: {LAST_UPDATED}</em>
      </p>

      <p>
        <strong>Placeholder.</strong> Replace this content with reviewed legal copy before launch.
        Until then, this page exists so the footer link, Stripe Checkout&apos;s policy display, and
        search engines have a destination.
      </p>

      <h2>1. Acceptance</h2>
      <p>
        By creating an account or otherwise using PickupVB (&quot;the Service&quot;), you agree to
        these Terms of Service and our Privacy Policy.
      </p>

      <h2>2. Accounts</h2>
      <p>
        You are responsible for activity on your account and for keeping your credentials secure.
        You must be at least 13 years old to use the Service.
      </p>

      <h2>3. Hosting and paid events</h2>
      <p>
        Hosts who collect payment through the Service do so via Stripe Connect and are bound by
        Stripe&apos;s{' '}
        <a
          href="https://stripe.com/connect-account/legal"
          target="_blank"
          rel="noopener noreferrer"
        >
          Connected Account Agreement
        </a>
        . Hosts are responsible for delivering the event they advertise and for handling
        cancellations and refunds according to the Refund Policy.
      </p>

      <h2>4. Acceptable use</h2>
      <p>
        You agree not to harass other players, post unlawful content, attempt to breach the
        Service&apos;s security, or use the Service to send unsolicited bulk communications.
      </p>

      <h2>5. Termination</h2>
      <p>
        We may suspend or terminate accounts that violate these terms. You may close your account at
        any time from your profile settings.
      </p>

      <h2>6. Disclaimers</h2>
      <p>
        The Service is provided &quot;as is&quot;. Pickup sports involve physical risk; you
        participate at your own risk.
      </p>

      <h2>7. Contact</h2>
      <p>
        Questions: <a href="mailto:support@pickupvb.com">support@pickupvb.com</a>.
      </p>
    </>
  );
}
