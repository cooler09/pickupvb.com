import { APP_URL, IS_PROD_HOST, PROD_APP_URL } from '@/lib/app-url';

/**
 * Sticky banner shown on every non-production deployment so it's
 * impossible to confuse `dev.pickupvb.com` (or a Vercel preview URL)
 * with the live site. Server component — renders nothing on prod and
 * adds zero client JS.
 *
 * Visibility is driven by `IS_PROD_HOST`, which is itself derived from
 * `NEXT_PUBLIC_APP_URL`. Same flag gates `robots.txt` and `sitemap.xml`,
 * so all "this is not production" behavior stays in sync.
 */
export function EnvBanner() {
  if (IS_PROD_HOST) return null;
  const host = (() => {
    try {
      return new URL(APP_URL).host;
    } catch {
      return APP_URL;
    }
  })();
  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-center text-xs font-medium text-amber-950 shadow-sm sm:text-sm"
    >
      <span aria-hidden="true">⚠️</span>
      <span>
        Development environment ({host}). Data here is throwaway. Production lives at{' '}
        <a href={PROD_APP_URL} className="underline underline-offset-2 hover:no-underline">
          {new URL(PROD_APP_URL).host}
        </a>
        .
      </span>
    </div>
  );
}
