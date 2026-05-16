import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { Metadata } from 'next/types';
import Link from 'next/link';
import { cookies } from 'next/headers';
import SiteHeader from '@/components/site-header';
import { ToastProvider } from '@/components/toast';
import { getServerSupabase } from '@/lib/supabase';
import {
    DEFAULT_THEME,
    isTheme,
    THEME_COOKIE,
    type Theme,
} from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
    title: {
        default: 'PickupVB — Find and host volleyball events',
        template: '%s · PickupVB',
    },
    description:
        'Discover, create, and manage pickup volleyball events. Indoor, grass, and beach. Open play and tournaments. Free to use.',
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
        title: 'PickupVB — Find and host volleyball events',
        description:
            'Discover, create, and manage pickup volleyball events. Indoor, grass, and beach. Open play and tournaments.',
        locale: 'en_US',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'PickupVB — Find and host volleyball events',
        description:
            'Discover, create, and manage pickup volleyball events. Indoor, grass, and beach. Open play and tournaments.',
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
        const supabase = await getServerSupabase();
        const {
            data: { user },
        } = await supabase.auth.getUser();
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
            <body className="min-h-dvh flex flex-col">
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }}
                />
                <a
                    href="#main"
                    className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-fg focus:shadow-lg"
                >
                    Skip to main content
                </a>
                <SiteHeader theme={theme} />
                <ToastProvider>
                    <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
                </ToastProvider>
                <footer className="border-t border-border-base py-6 text-center text-sm text-muted">
                    © {new Date().getFullYear()}{' '}
                    <Link href="/" className="hover:underline">
                        PickupVB
                    </Link>
                </footer>
                <Analytics />
                <SpeedInsights />
            </body>
        </html>
    );
}
