import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/site-header';
import './globals.css';

export const metadata: Metadata = {
    title: 'PickupVB — Find and host volleyball events',
    description:
        'Discover, create, and manage pickup volleyball events. Indoor, grass, and beach. Open play and tournaments.',
    metadataBase: new URL('https://pickupvb.com'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className="min-h-dvh flex flex-col">
                <SiteHeader />
                <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
                <footer className="border-t border-net-900/10 py-6 text-center text-sm text-net-800/70">
                    © {new Date().getFullYear()}{' '}
                    <Link href="/" className="hover:underline">
                        PickupVB
                    </Link>
                </footer>
            </body>
        </html>
    );
}
