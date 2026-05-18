import Link from 'next/link';
import type { Route } from 'next';

import { ReportBugButton } from './report-bug-button';

/**
 * Site-wide footer. Three small columns on desktop, stacked on mobile.
 * Pure server component — no state, no auth-dependent links.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-border-base text-muted mt-auto border-t">
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div>
            <Link href="/" className="text-fg text-base font-semibold hover:underline">
              PickupVB
            </Link>
            <p className="mt-2 text-sm">Find, host, and join pickup volleyball events.</p>
          </div>

          <FooterColumn
            title="Product"
            links={[
              { href: '/events', label: 'Browse events' },
              { href: '/pricing', label: 'Pricing' },
              { href: '/tools', label: 'Tools' },
            ]}
          />

          <FooterColumn
            title="Legal"
            links={[
              { href: '/legal/terms' as Route, label: 'Terms of Service' },
              { href: '/legal/privacy' as Route, label: 'Privacy Policy' },
              { href: '/legal/refunds' as Route, label: 'Refund Policy' },
            ]}
            extras={[{ href: 'mailto:support@pickupvb.com', label: 'Contact support' }]}
          />
        </div>

        <div className="border-border-base text-muted mt-8 flex flex-col items-center gap-2 border-t pt-6 text-center text-xs sm:flex-row sm:justify-between">
          <p>© {year} PickupVB. All rights reserved.</p>
          <p>
            Found a bug? <ReportBugButton />
          </p>
        </div>
      </div>
    </footer>
  );
}

type InternalLink = { href: Route; label: string };
type ExternalLink = { href: string; label: string };

function FooterColumn({
  title,
  links,
  extras = [],
}: {
  title: string;
  links: InternalLink[];
  extras?: ExternalLink[];
}) {
  return (
    <div>
      <h2 className="text-fg text-sm font-semibold">{title}</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {links.map((link, i) => (
          <li key={i}>
            <Link href={link.href} className="hover:underline">
              {link.label}
            </Link>
          </li>
        ))}
        {extras.map((link) => (
          <li key={link.href}>
            <a href={link.href} className="hover:underline">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
