import { Suspense } from 'react';
import type { Metadata } from 'next/types';
import type { Viewport } from 'next';
import { cookies } from 'next/headers';
import SiteHeader from '@/components/site-header';
import BottomNav from '@/components/bottom-nav';
import { SiteFooter } from '@/components/site-footer';
import { ToastProvider } from '@/components/toast';
import { EnvBanner } from '@/components/env-banner';
import { WebVitalsClient } from '@/components/web-vitals-client';
import { ConsentBanner } from '@/components/consent-banner';
import { AuthStateSync } from '@/components/auth-state-sync';
import { PostHogProvider } from '@/components/posthog-provider';
import { getCurrentUser } from '@/lib/server-auth';
import { getViewerHashedDistinctId, getViewerTraits } from '@/lib/server-distinct-id';
import { hasAnalyticsConsent, isConsentDecided } from '@/lib/consent';
import {
  DEFAULT_PREFERENCE,
  isTheme,
  isThemePreference,
  resolveThemeForSSR,
  THEME_COOKIE,
  type ThemePreference,
} from '@/lib/theme';
import './globals.css';

const POSTHOG_BROWSER_KEY = process.env['NEXT_PUBLIC_POSTHOG_KEY'];
const POSTHOG_BROWSER_HOST = process.env['NEXT_PUBLIC_POSTHOG_HOST'] ?? 'https://us.i.posthog.com';

/**
 * `viewportFit: 'cover'` lets `env(safe-area-inset-*)` resolve to non-zero
 * values on iOS notch / Android gesture-bar devices, which the `pt-safe` /
 * `pb-safe` / `pl-safe` / `pr-safe` utilities in `globals.css` consume.
 * Required for the M3 BottomNav + FAB landing in later bundles of the
 * m3-alignment audit, but harmless to ship now.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#e6004a',
};

export const metadata: Metadata = {
  title: {
    default: 'PickupVB — Find, host, and join pickup volleyball events',
    template: '%s · PickupVB',
  },
  description:
    'Discover, create, and join pickup volleyball events near you — indoor, grass, and beach. Open play, leagues, and tournaments. Free to use.',
  metadataBase: new URL('https://pickupvb.com'),
  applicationName: 'PickupVB',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'PickupVB', statusBarStyle: 'default' },
  keywords: [
    'volleyball',
    'pickup volleyball',
    'volleyball events',
    'beach volleyball',
    'indoor volleyball',
    'grass volleyball',
    'volleyball tournaments',
    'volleyball league',
    'volleyball open play',
    'sand volleyball',
  ],
  authors: [{ name: 'PickupVB' }],
  creator: 'PickupVB',
  publisher: 'PickupVB',
  formatDetection: { email: false, address: false, telephone: false },
  openGraph: {
    type: 'website',
    siteName: 'PickupVB',
    url: 'https://pickupvb.com',
    title: 'PickupVB — Find, host, and join pickup volleyball events',
    description:
      'Discover, create, and join pickup volleyball events near you — indoor, grass, and beach. Open play, leagues, and tournaments. Free to use.',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PickupVB — Find, host, and join pickup volleyball events',
    description:
      'Discover, create, and join pickup volleyball events near you — indoor, grass, and beach. Open play, leagues, and tournaments. Free to use.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  alternates: { canonical: '/' },
  category: 'sports',
};

const siteJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://pickupvb.com/#org',
      name: 'PickupVB',
      url: 'https://pickupvb.com',
      description:
        'PickupVB helps players find, host, and manage pickup volleyball events — indoor, grass, and beach — including open play and tournaments.',
      sameAs: [],
    },
    {
      '@type': 'WebSite',
      '@id': 'https://pickupvb.com/#site',
      url: 'https://pickupvb.com',
      name: 'PickupVB',
      publisher: { '@id': 'https://pickupvb.com/#org' },
      inLanguage: 'en-US',
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: 'https://pickupvb.com/events?q={search_term_string}',
        },
        'query-input': 'required name=search_term_string',
      },
    },
  ],
};

async function resolveTheme(): Promise<ThemePreference> {
  const cookieValue = (await cookies()).get(THEME_COOKIE)?.value;
  if (isThemePreference(cookieValue)) return cookieValue;

  // No cookie yet — fall back to the signed-in user's saved preference.
  // Profile stores only light|dark (no 'system'), so `isTheme` is the
  // right guard here.
  try {
    const { supabase, user } = await getCurrentUser();
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('theme_preference')
        .eq('id', user.id)
        .maybeSingle();
      const pref = (data as { theme_preference?: string } | null)?.theme_preference;
      if (isTheme(pref)) return pref;
    }
  } catch {
    // Profile lookup failures shouldn't break rendering.
  }
  return DEFAULT_PREFERENCE;
}

/**
 * Bootstrap script that runs as the first child of `<body>`. When the
 * resolved preference is `'system'`, the SSR-side resolver couldn't read
 * the OS dark-mode setting and fell back to `DEFAULT_THEME`. This script
 * corrects `data-theme` to the OS choice before paint and keeps it in
 * sync with `prefers-color-scheme` changes. No-op for explicit
 * light/dark preferences.
 */
const THEME_BOOTSTRAP = `(function(){var d=document.documentElement;if(d.getAttribute('data-theme-mode')!=='system')return;var m=window.matchMedia('(prefers-color-scheme: dark)');function a(){d.setAttribute('data-theme',m.matches?'dark':'light');}a();m.addEventListener('change',a);})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [preference, analyticsAllowed, decided, hashedDistinctId, traits] = await Promise.all([
    resolveTheme(),
    hasAnalyticsConsent(),
    isConsentDecided(),
    getViewerHashedDistinctId(),
    getViewerTraits(),
  ]);
  const theme = resolveThemeForSSR(preference);
  return (
    <html lang="en" data-theme={theme} data-theme-mode={preference}>
      <body className="flex min-h-dvh flex-col">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }}
        />
        <a
          href="#main"
          className="focus:bg-primary focus:text-primary-fg sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:px-3 focus:py-2 focus:text-sm focus:shadow-lg"
        >
          Skip to main content
        </a>
        <AuthStateSync />
        <EnvBanner />
        <SiteHeader theme={preference} />
        <ToastProvider>
          <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
            {children}
          </main>
        </ToastProvider>
        <Suspense fallback={null}>
          <PostHogProvider
            allowed={analyticsAllowed}
            hashedDistinctId={hashedDistinctId}
            traits={traits}
            apiKey={POSTHOG_BROWSER_KEY}
            apiHost={POSTHOG_BROWSER_HOST}
          />
        </Suspense>
        <SiteFooter />
        {/* Spacer to keep the SiteFooter clear of the fixed BottomNav on
            mobile. BottomNav is `h-16` plus `pb-safe`; the matching
            spacer hides at `md` where the bar itself hides. */}
        <div aria-hidden="true" className="pb-safe h-16 md:hidden" />
        <BottomNav />
        {analyticsAllowed ? <WebVitalsClient /> : null}
        {decided ? null : <ConsentBanner />}
      </body>
    </html>
  );
}
