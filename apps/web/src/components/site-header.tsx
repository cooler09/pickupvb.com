import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase';
import { signOut } from './actions';

export const dynamic = 'force-dynamic';

function initialsOf(email: string): string {
    const local = email.split('@')[0] ?? '';
    const parts = local.split(/[._-]/).filter(Boolean);
    const letters = (parts.length >= 2 ? parts[0]![0]! + parts[1]![0]! : local.slice(0, 2)) || '?';
    return letters.toUpperCase();
}

export default async function SiteHeader() {
    const supabase = getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    return (
        <header className="border-b border-net-900/10">
            <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
                <Link href="/" className="text-xl font-bold text-court-600">
                    PickupVB
                </Link>
                <ul className="flex items-center gap-4 text-sm">
                    <li>
                        <Link href="/events" className="hover:text-court-600">
                            Find events
                        </Link>
                    </li>
                    <li>
                        <Link href="/events/new" className="hover:text-court-600">
                            Host an event
                        </Link>
                    </li>
                    <li>
                        <Link href="/tools" className="hover:text-court-600">
                            Host tools
                        </Link>
                    </li>
                    {user ? (
                        <li className="flex items-center gap-3">
                            <span
                                className="flex h-8 w-8 items-center justify-center rounded-full bg-court-100 text-xs font-semibold text-court-700"
                                title={user.email ?? ''}
                                aria-label={`Signed in as ${user.email ?? 'user'}`}
                            >
                                {initialsOf(user.email ?? '?')}
                            </span>
                            <span className="hidden text-net-900/70 sm:inline">
                                {user.email}
                            </span>
                            <form action={signOut}>
                                <button
                                    type="submit"
                                    className="rounded-md border border-net-900/20 px-3 py-1.5 hover:bg-net-900/5"
                                >
                                    Sign out
                                </button>
                            </form>
                        </li>
                    ) : (
                        <>
                            <li>
                                <Link href="/login" className="hover:text-court-600">
                                    Sign in
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="/login?mode=sign-up"
                                    className="rounded-md bg-court-600 px-3 py-1.5 text-white hover:bg-court-700"
                                >
                                    Sign up
                                </Link>
                            </li>
                        </>
                    )}
                </ul>
            </nav>
        </header>
    );
}
