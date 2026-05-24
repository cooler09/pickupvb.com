import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How PickupVB collects, uses, and protects your information.',
};

const LAST_UPDATED = 'May 24, 2026';
const COMPANY = 'Zachary Lockhart Consulting, LLC';
const BRAND = 'PickupVB';
const PRIVACY_EMAIL = 'privacy@pickupvb.com';
const CONTACT_EMAIL = 'support@pickupvb.com';

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p>
        <em>Last updated: {LAST_UPDATED}</em>
      </p>

      <p>
        This Privacy Policy explains how {COMPANY} (&quot;{BRAND}&quot;, &quot;we&quot;,
        &quot;us&quot;) collects, uses, and shares information when you use the {BRAND} website and
        related services (the &quot;Service&quot;). Capitalized terms not defined here have the
        meanings given in our <a href="/legal/terms">Terms of Service</a>.
      </p>

      <h2>1. Information we collect</h2>

      <h3>Information you provide</h3>
      <ul>
        <li>
          <strong>Account information:</strong> email address, display name, password (stored hashed
          by our auth provider), and an optional avatar image.
        </li>
        <li>
          <strong>Profile information:</strong> any details you choose to add, such as bio, skill
          level, location, or social links.
        </li>
        <li>
          <strong>Event content:</strong> events you create or RSVP to, messages you send, comments,
          and ratings.
        </li>
        <li>
          <strong>Payment information:</strong> when you buy a Pro Subscription, pay for an event,
          or receive payouts as a Host, payment details are collected and stored by Stripe. We
          receive a customer/subscription identifier, the last four digits of your card, and billing
          metadata, but we do not see or store full card numbers.
        </li>
        <li>
          <strong>Support communications:</strong> messages you send to support and any information
          you include in them.
        </li>
      </ul>

      <h3>Information collected automatically</h3>
      <ul>
        <li>
          <strong>Device and log data:</strong> IP address, browser type, operating system,
          referring URL, pages viewed, and timestamps.
        </li>
        <li>
          <strong>Cookies and similar technologies:</strong> session cookies for authentication,
          preference cookies (e.g. theme), and limited analytics. See Section 5.
        </li>
        <li>
          <strong>Approximate location:</strong> derived from your IP address or, if you grant
          permission, your device&apos;s geolocation, to surface nearby events.
        </li>
        <li>
          <strong>Error telemetry:</strong> we use Sentry to capture errors that occur in the
          Service. This includes the URL, a stack trace, and your user identifier; we do not include
          passwords, payment data, or message contents.
        </li>
      </ul>

      <h3>Information from third parties</h3>
      <ul>
        <li>
          <strong>Payment processor:</strong> Stripe shares limited transaction and account-status
          information with us so we can show your subscription and payout state.
        </li>
        <li>
          <strong>Anti-abuse:</strong> Cloudflare Turnstile returns a verdict (human / bot) when you
          submit certain forms; we do not receive raw browser fingerprints.
        </li>
      </ul>

      <h2>2. How we use information</h2>
      <ul>
        <li>To create and operate your Account and provide the Service.</li>
        <li>
          To show you relevant events and let other users find events you host or attend (per the
          visibility settings you choose).
        </li>
        <li>To process payments, payouts, and subscription billing.</li>
        <li>
          To send transactional emails (account, event, payment notifications) and, with your
          consent where required, product updates.
        </li>
        <li>
          To protect the Service from fraud, abuse, and unauthorized access, including by using IP
          and account signals to detect suspicious activity.
        </li>
        <li>To analyze and improve the Service in aggregate, non-identifying form.</li>
        <li>To comply with legal obligations and enforce our Terms.</li>
      </ul>

      <h2>3. Legal bases for processing (EEA/UK users)</h2>
      <p>
        Where the EU or UK General Data Protection Regulation applies, we rely on the following
        legal bases: (a) <em>contract</em>, to provide the Service you requested; (b)
        <em>legitimate interests</em>, to operate, secure, and improve the Service; (c)
        <em>consent</em>, for optional analytics cookies and marketing emails; and (d){' '}
        <em>legal obligation</em>, where required by law. You may withdraw consent at any time.
      </p>

      <h2>4. How we share information</h2>
      <ul>
        <li>
          <strong>With other users:</strong> your public profile and event activity are visible to
          other users as permitted by your settings.
        </li>
        <li>
          <strong>With Hosts and Attendees:</strong> when you RSVP to or host an event, the other
          party may see your display name, avatar, and roster status; Hosts may see attendee contact
          info needed to run the event.
        </li>
        <li>
          <strong>With service providers (subprocessors):</strong> we share information with vendors
          who help us run the Service:
          <ul>
            <li>Supabase (managed Postgres, authentication)</li>
            <li>Vercel (hosting, edge compute, web analytics)</li>
            <li>PostHog (product analytics, server-side capture only)</li>
            <li>Stripe (payments, payouts, billing portal)</li>
            <li>Resend (transactional email)</li>
            <li>Sentry (error monitoring)</li>
            <li>Cloudflare Turnstile (bot protection)</li>
          </ul>
          These providers are bound by contract to use your information only to provide services to
          us.
        </li>
        <li>
          <strong>For legal reasons:</strong> we may disclose information when required by law,
          subpoena, or court order, or when we believe disclosure is necessary to protect rights,
          property, or safety.
        </li>
        <li>
          <strong>In a business transfer:</strong> if {COMPANY} is involved in a merger,
          acquisition, or asset sale, your information may be transferred as part of that
          transaction; we will give notice before information becomes subject to a different privacy
          policy.
        </li>
      </ul>
      <p>
        <strong>We do not sell your personal information,</strong> and we do not share it for
        cross-context behavioral advertising as those terms are defined under California law.
      </p>

      <h2>5. Cookies and tracking</h2>
      <p>
        We use first-party cookies for authentication, security (CSRF protection), and saving
        preferences (e.g. theme). We use Vercel Analytics and PostHog for first-party, aggregate
        product analytics &mdash; PostHog captures happen server-side only, so no third-party
        tracking script runs in your browser. PostHog distinct ids are derived from a salted hash of
        your account id; the raw id never leaves our servers.
      </p>
      <p>
        The first time you visit the Service you&apos;ll see a consent banner with two choices:{' '}
        <strong>Accept</strong> (first-party analytics on) or <strong>Decline</strong>
        (analytics suppressed at the server adapter). Your choice is stored in a
        <code> pickupvb_consent</code> cookie for 180 days; you can change it at any time by
        clearing site cookies, and we honor the <em>Global Privacy Control</em> (GPC) signal as a
        default-deny for analytics until you explicitly accept.
      </p>
      <p>
        You can also disable cookies in your browser settings, but the Service may not function
        properly without authentication cookies.
      </p>

      <h2>6. Data retention</h2>
      <p>
        We retain account information for as long as your Account is active. When you delete your
        Account we delete or anonymize your personal information within 30 days, except where we are
        required to retain it for legal, accounting, tax, fraud-prevention, or dispute purposes (for
        example, payment records retained by Stripe as required by financial regulations). Server
        log data is retained for up to 90 days for security purposes.
      </p>

      <h2>7. Security</h2>
      <p>
        We use industry-standard technical and organizational measures to protect your information,
        including TLS for data in transit, encryption at rest for the database, password hashing,
        row-level access controls, and least-privilege service credentials. No system is 100%
        secure; if you believe your Account has been compromised, contact{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> immediately.
      </p>

      <h2>8. International data transfers</h2>
      <p>
        We operate from the United States and our subprocessors may process information in the
        United States or other countries. If you access the Service from outside the United States,
        your information will be transferred to and processed in the United States. We rely on
        appropriate safeguards (such as the EU Standard Contractual Clauses) where required.
      </p>

      <h2>9. Your privacy rights</h2>
      <p>Subject to applicable law, you have the right to:</p>
      <ul>
        <li>Access the personal information we hold about you.</li>
        <li>Correct inaccurate information.</li>
        <li>Delete your information (subject to retention exceptions in Section 6).</li>
        <li>Receive a copy of your information in a portable format.</li>
        <li>Object to or restrict certain processing.</li>
        <li>Withdraw consent where processing is based on consent.</li>
        <li>Lodge a complaint with a supervisory authority.</li>
      </ul>
      <p>
        Most rights can be exercised from your profile settings. For other requests, email{' '}
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>. We will respond within the
        timeframes required by applicable law (typically 30 days). We may need to verify your
        identity before fulfilling a request.
      </p>

      <h3>California residents (CCPA / CPRA)</h3>
      <p>
        California residents have the rights described above and the right to be free from
        discrimination for exercising them. The categories of personal information we have collected
        in the past 12 months map to the &quot;identifiers&quot;, &quot;commercial
        information&quot;, &quot;internet or other electronic network activity information&quot;,
        and &quot;geolocation data&quot; categories under the CCPA. We do not sell or share personal
        information for cross-context behavioral advertising.
      </p>

      <h2>10. Children</h2>
      <p>
        The Service is not directed to children under 13, and we do not knowingly collect personal
        information from children under 13. If you believe a child has provided us with personal
        information, contact <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a> and we will
        delete it.
      </p>

      <h2>11. Do Not Track</h2>
      <p>
        The Service does not respond to &quot;Do Not Track&quot; browser signals because no common
        industry standard for them has been adopted. We do honor the Global Privacy Control (GPC)
        signal where required by law.
      </p>

      <h2>12. Changes to this Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. If we make material changes we will
        notify you (for example, by email or an in-app notice) and update the &quot;Last
        updated&quot; date above. Continued use of the Service after the effective date constitutes
        acceptance.
      </p>

      <h2>13. Contact</h2>
      <p>
        Privacy questions or requests: <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>.
        General support: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
      <p>
        <strong>{COMPANY}</strong>
      </p>
    </>
  );
}
