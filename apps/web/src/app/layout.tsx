import type { Metadata } from 'next';
import Link from 'next/link';
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
                <header className="border-b border-net-900/10">
                    <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
                        <Link href="/" className="text-xl font-bold text-court-600">
                            PickupVB
                        </Link>
                        <ul className="flex items-center gap-4 text-sm">
                            <li><Link href="/events" className="hover:text-court-600">Find events</Link></li>
                            <li><Link href="/events/new" className="hover:text-court-600">Host an event</Link></li>
                            <li><Link href="/tools" className="hover:text-court-600">Host tools</Link></li>
                            <li>
                                <Link
                                    href="/login"
                                    className="rounded-md bg-court-600 px-3 py-1.5 text-white hover:bg-court-700"
                                >
                                    Sign in
                                </Link>
                            </li>
                        </ul>
                    </nav>
                </header>
                <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
                <footer className="border-t border-net-900/10 py-6 text-center text-sm text-net-800/70">
                    © {new Date().getFullYear()} PickupVB
                </footer>
            </body>
        </html>
    );
}
