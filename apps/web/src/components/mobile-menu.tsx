'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Theme } from '@/lib/theme';
import { ThemeToggle } from './theme-toggle';
import { signOut } from './actions';

type Props = {
    theme: Theme;
    user: { displayName: string; initials: string } | null;
    /** Number of unanswered team invites for the signed-in user. */
    pendingTeamInvites: number;
};

export function MobileMenu({ theme, user, pendingTeamInvites }: Props) {
    const [open, setOpen] = useState(false);
    const pathname = usePathname();

    // Close drawer on route change.
    useEffect(() => {
        setOpen(false);
    }, [pathname]);

    // Lock background scroll while drawer is open.
    useEffect(() => {
        if (!open) return;
        const original = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = original;
        };
    }, [open]);

    return (
        <div className="md:hidden">
            <button
                type="button"
                aria-label={open ? 'Close menu' : 'Open menu'}
                aria-expanded={open}
                aria-controls="mobile-nav"
                onClick={() => setOpen((v) => !v)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border-base text-fg hover:bg-fg/5"
            >
                {open ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                )}
            </button>

            {open && (
                <>
                    <button
                        type="button"
                        aria-label="Close menu"
                        onClick={() => setOpen(false)}
                        className="fixed inset-0 z-40 bg-black/40"
                    />
                    <div
                        id="mobile-nav"
                        className="fixed inset-x-0 top-[57px] z-50 border-b border-border-base bg-surface px-4 py-4 shadow-lg"
                    >
                        <ul className="flex flex-col gap-1 text-base">
                            <li>
                                <Link href="/events" className="block rounded-md px-3 py-2 hover:bg-fg/5">
                                    Find events
                                </Link>
                            </li>
                            <li>
                                <Link href="/events/new" className="block rounded-md px-3 py-2 hover:bg-fg/5">
                                    Host an event
                                </Link>
                            </li>
                            <li>
                                <Link href="/groups" className="block rounded-md px-3 py-2 hover:bg-fg/5">
                                    Groups
                                </Link>
                            </li>
                            <li>
                                <Link href="/players" className="block rounded-md px-3 py-2 hover:bg-fg/5">
                                    Players
                                </Link>
                            </li>
                            {user && (
                                <li>
                                    <Link
                                        href="/teams"
                                        className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-fg/5"
                                    >
                                        <span>Teams</span>
                                        {pendingTeamInvites > 0 && (
                                            <span
                                                aria-label={`${pendingTeamInvites} pending team invite${pendingTeamInvites === 1 ? '' : 's'}`}
                                                className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                                            >
                                                {pendingTeamInvites}
                                            </span>
                                        )}
                                    </Link>
                                </li>
                            )}
                            <li>
                                <Link href="/tools" className="block rounded-md px-3 py-2 hover:bg-fg/5">
                                    Host tools
                                </Link>
                            </li>
                            <li>
                                <Link href="/pricing" className="block rounded-md px-3 py-2 hover:bg-fg/5">
                                    Pricing
                                </Link>
                            </li>
                        </ul>

                        <div className="mt-4 border-t border-border-base pt-4">
                            <div className="mb-3 flex items-center justify-between">
                                <span className="text-xs uppercase tracking-wide text-fg/60">Theme</span>
                                <ThemeToggle current={theme} />
                            </div>

                            {user ? (
                                <div className="space-y-3">
                                    <Link
                                        href="/profile"
                                        className="flex items-center gap-3 rounded-md px-2 py-1 hover:bg-fg/5"
                                    >
                                        <span
                                            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary"
                                            aria-hidden="true"
                                        >
                                            {user.initials}
                                        </span>
                                        <span className="flex-1 truncate text-sm text-fg/80">{user.displayName}</span>
                                        <span className="text-xs text-fg/60">Profile →</span>
                                    </Link>
                                    <form action={signOut}>
                                        <button
                                            type="submit"
                                            className="w-full rounded-md border border-border-base px-3 py-2 text-sm hover:bg-fg/5"
                                        >
                                            Sign out
                                        </button>
                                    </form>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-2">
                                    <Link
                                        href="/login"
                                        className="rounded-md border border-border-base px-3 py-2 text-center text-sm hover:bg-fg/5"
                                    >
                                        Sign in
                                    </Link>
                                    <Link
                                        href="/login?mode=sign-up"
                                        className="rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-white hover:bg-primary/90"
                                    >
                                        Sign up
                                    </Link>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
