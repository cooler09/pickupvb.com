import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { Metadata } from 'next/types';
import { cookies } from 'next/headers';
import SiteHeader from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { ToastProvider } from '@/components/toast';
import { EnvBanner } from '@/components/env-banner';
import { getCurrentUser } from '@/lib/server-auth';
import { DEFAULT_THEME, isTheme, THEME_COOKIE, type Theme } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'PickupVB — Find, host, and join pickup volleyball events',
    template: '%s · PickupVB',
  },
  description:
    'Discover, create, and join pickup volleyball events near you — indoor, grass, and beach. Open play, leagues, and tournaments. Free to use.',
  metadataBase: new URL('https://pickupvb.com'),
  applicationName: 'PickupVB',
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

async function resolveTheme(): Promise<Theme> {
  const cookieValue = (await cookies()).get(THEME_COOKIE)?.value;
  if (isTheme(cookieValue)) return cookieValue;

  // No cookie yet — fall back to the signed-in user's saved preference.
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
  return DEFAULT_THEME;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await resolveTheme();
  return (
    <html lang="en" data-theme={theme}>
      <body className="flex min-h-dvh flex-col">
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
        <EnvBanner />
        <SiteHeader theme={theme} />
        <ToastProvider>
          <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
            {children}
          </main>
        </ToastProvider>
        <SiteFooter />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
