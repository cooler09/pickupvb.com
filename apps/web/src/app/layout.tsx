import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import SiteHeader from '@/components/site-header';
import { getServerSupabase } from '@/lib/supabase';
import {
    DEFAULT_THEME,
    isTheme,
    THEME_COOKIE,
    type Theme,
} from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
    title: 'PickupVB — Find and host volleyball events',
    description:
        'Discover, create, and manage pickup volleyball events. Indoor, grass, and beach. Open play and tournaments.',
    metadataBase: new URL('https://pickupvb.com'),
};

async function resolveTheme(): Promise<Theme> {
    const cookieValue = cookies().get(THEME_COOKIE)?.value;
    if (isTheme(cookieValue)) return cookieValue;

    // No cookie yet — fall back to the signed-in user's saved preference.
    try {
        const supabase = getServerSupabase();
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
                <a
                    href="#main"
                    className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-fg focus:shadow-lg"
                >
                    Skip to main content
                </a>
                <SiteHeader theme={theme} />
                <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
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
