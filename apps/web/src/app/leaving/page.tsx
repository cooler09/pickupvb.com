import Link from 'next/link';
import { primaryButtonClass } from '@/components/primary-button';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { isTrustedExternalUrl } from '@/lib/external-link';

export const metadata = {
  title: 'Leaving PickupVB',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ url?: string | string[] }>;

/**
 * External-link interstitial.
 *
 * User-supplied URLs (event external-registration URLs, profile websites,
 * community-listing destinations, …) route through here so we can name the
 * destination host before the visitor clicks through. See
 * [external-link.ts](../../lib/external-link.ts) for the helper that
 * decides which destinations warrant the warning.
 *
 * Trusted hosts shouldn't reach this page in the first place — but if
 * one does (e.g. a hand-typed URL), we just redirect to it.
 */
export default async function LeavingPage(props: { searchParams: SearchParams }) {
  const sp = await props.searchParams;
  const raw = Array.isArray(sp.url) ? sp.url[0] : sp.url;
  const target = (raw ?? '').trim();

  // Parse + scheme-guard. We refuse anything that isn't a real http(s) URL
  // so a malicious `?url=javascript:…` or `?url=data:…` can't ride out
  // through the `<a href>` below.
  let parsed: URL | null = null;
  try {
    if (target) parsed = new URL(target);
  } catch {
    parsed = null;
  }
  const isHttp = parsed?.protocol === 'http:' || parsed?.protocol === 'https:';

  if (parsed && isHttp && isTrustedExternalUrl(parsed.toString())) {
    // `redirect()` accepts external URLs at runtime, but the
    // `typedRoutes: true` signature only types internal `Route`s.
    // Cast through `Route` so trusted off-platform destinations can
    // skip the interstitial.
    redirect(parsed.toString() as Route);
  }

  if (!parsed || !isHttp) {
    return (
      <main className="mx-auto max-w-md space-y-6 px-4 py-12 text-center">
        <h1 className="text-fg text-2xl font-bold">Bad link</h1>
        <p className="text-muted text-sm">
          That link is missing or malformed. Head back and try again.
        </p>
        <Link
          href="/"
          className="border-border-base hover:bg-fg/5 inline-block rounded-md border px-3 py-1.5 text-sm"
        >
          Back to PickupVB
        </Link>
      </main>
    );
  }

  const destination = parsed.toString();
  const displayHost = parsed.host.replace(/^www\./, '');

  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-12">
      <header className="space-y-2 text-center">
        <h1 className="text-fg text-2xl font-bold">You&rsquo;re leaving PickupVB</h1>
        <p className="text-muted text-sm">
          This link goes to a site we don&rsquo;t control. Check the destination before continuing.
        </p>
      </header>

      <section className="border-border-base bg-surface rounded-shape-sm border p-4">
        <p className="text-muted text-xs tracking-wide uppercase">Destination</p>
        <p className="text-fg mt-1 text-base font-semibold break-all">{displayHost}</p>
        <p className="text-muted mt-2 text-xs break-all">{destination}</p>
      </section>

      <p className="text-muted text-xs">
        PickupVB doesn&rsquo;t verify content, security, or refund policies on third-party sites. If
        anything looks off, don&rsquo;t continue.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        {/* Plain <a> on purpose — we want a normal navigation, not a Next
            router transition, so the destination opens as a real cross-site
            request. `noopener noreferrer` prevents the destination from
            reaching back into our window or seeing our path as the referrer. */}
        <a
          href={destination}
          target="_blank"
          rel="noopener noreferrer nofollow external"
          className={primaryButtonClass('md')}
        >
          Continue to {displayHost} <span aria-hidden="true">↗</span>
          <span className="sr-only"> (opens in new tab)</span>
        </a>
        <Link
          href="/"
          className="border-border-base hover:bg-fg/5 rounded-md border px-4 py-2 text-center text-sm"
        >
          Cancel
        </Link>
      </div>
    </main>
  );
}
