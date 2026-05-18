import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How PickupVB collects, uses, and protects your information.',
};

const LAST_UPDATED = 'May 18, 2026';

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p>
        <em>Last updated: {LAST_UPDATED}</em>
      </p>

      <p>
        <strong>Placeholder.</strong> Replace this content with reviewed privacy copy before launch.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Account info (email, display name, optional avatar).</li>
        <li>Event activity (events you host, join, or tip).</li>
        <li>Payment metadata via Stripe (we never see card numbers).</li>
        <li>Standard request logs (IP, user-agent) for security and abuse prevention.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To operate the Service: show events, send notifications, process payments.</li>
        <li>To improve the Service: aggregate analytics via Vercel Analytics.</li>
        <li>To meet legal obligations.</li>
      </ul>

      <h2>Subprocessors</h2>
      <p>
        We rely on Supabase (database, auth), Vercel (hosting), Stripe (payments), Resend
        (transactional email), Sentry (error reporting), and Cloudflare Turnstile (bot protection).
      </p>

      <h2>Your choices</h2>
      <p>
        You can edit your profile, unsubscribe from emails, and delete your account from your
        profile settings. Contact <a href="mailto:support@pickupvb.com">support@pickupvb.com</a> for
        data export or any privacy questions.
      </p>
    </>
  );
}
