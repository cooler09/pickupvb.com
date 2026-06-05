import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Accessibility',
  description:
    'PickupVB’s commitment to accessibility, our conformance target, known limitations, and how to report a barrier.',
  alternates: { canonical: '/legal/accessibility' },
};

const LAST_UPDATED = 'June 3, 2026';
const BRAND = 'PickupVB';
const CONTACT_EMAIL = 'support@pickupvb.com';

export default function AccessibilityPage() {
  return (
    <>
      <h1>Accessibility</h1>
      <p>
        <em>Last reviewed: {LAST_UPDATED}</em>
      </p>

      <p>
        {BRAND} is committed to making pickup volleyball easy to find, host, and join for everyone —
        including people who use assistive technology such as screen readers, screen magnifiers,
        switch devices, or keyboard-only navigation.
      </p>

      <h2>Conformance target</h2>
      <p>
        We aim to conform to the{' '}
        <a href="https://www.w3.org/TR/WCAG21/" target="_blank" rel="noopener noreferrer">
          Web Content Accessibility Guidelines (WCAG) 2.1, Level AA
        </a>
        . These guidelines explain how to make web content more accessible to people with a wide
        range of disabilities. Accessibility is an ongoing effort, and we review new features
        against this bar as they ship.
      </p>

      <h2>What we’ve done</h2>
      <ul>
        <li>Semantic HTML with labelled landmarks and a skip-to-content link.</li>
        <li>Keyboard support for menus, dialogs, date pickers, and search comboboxes.</li>
        <li>Visible focus indicators and touch targets sized for motor accessibility.</li>
        <li>
          Form fields with programmatic labels and error messages announced to screen readers.
        </li>
        <li>Live regions that announce chat messages and other dynamic updates.</li>
        <li>Color choices reviewed for contrast in both light and dark themes.</li>
        <li>Support for your operating system’s reduced-motion preference.</li>
      </ul>

      <h2>Known limitations</h2>
      <p>
        Some areas are still being improved, and a few rely on third parties whose accessibility we
        do not control:
      </p>
      <ul>
        <li>
          <strong>Maps.</strong> Event locations are shown on an interactive map. The full street
          address is always provided as text next to the map so the location does not depend on the
          map itself.
        </li>
        <li>
          <strong>Payments.</strong> Checkout and billing are handled by Stripe’s hosted pages,
          which are governed by Stripe’s own accessibility practices.
        </li>
        <li>
          <strong>The live scoreboard tool.</strong> The gym scoreboard is a fast, touch-first
          surface; we are continuing to improve its screen-reader experience.
        </li>
      </ul>

      <h2>Tell us about a barrier</h2>
      <p>
        If you run into an accessibility barrier on {BRAND}, we want to fix it. Email{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with the page or feature, what went
        wrong, and the assistive technology and browser you were using. We aim to respond within
        five business days.
      </p>

      <h2>Updates</h2>
      <p>
        We review this statement as the product changes and update the “last reviewed” date above
        when we do.
      </p>
    </>
  );
}
