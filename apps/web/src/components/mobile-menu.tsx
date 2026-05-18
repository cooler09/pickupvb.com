'use client';

import { useEffect, useRef, useState } from 'react';
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
  const triggerRef = useRef<HTMLButtonElement | null>(null);

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

  // Escape closes the drawer and returns focus to the trigger.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls="mobile-nav"
        onClick={() => setOpen((v) => !v)}
        className="border-border-base text-fg hover:bg-fg/5 inline-flex h-11 w-11 items-center justify-center rounded-md border"
      >
        {open ? (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
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
            className="border-border-base bg-surface fixed inset-x-0 top-[57px] z-50 border-b px-4 py-4 shadow-lg"
          >
            <ul className="flex flex-col gap-1 text-base">
              <li>
                <Link href="/events" className="hover:bg-fg/5 block rounded-md px-3 py-2">
                  Find events
                </Link>
              </li>
              <li>
                <Link href="/events/new" className="hover:bg-fg/5 block rounded-md px-3 py-2">
                  Host an event
                </Link>
              </li>
              <li>
                <Link href="/community" className="hover:bg-fg/5 block rounded-md px-3 py-2">
                  Community
                </Link>
              </li>
              <li>
                <Link href="/groups" className="hover:bg-fg/5 block rounded-md px-3 py-2">
                  Groups
                </Link>
              </li>
              <li>
                <Link href="/players" className="hover:bg-fg/5 block rounded-md px-3 py-2">
                  Players
                </Link>
              </li>
              {user && (
                <li>
                  <Link
                    href="/teams"
                    className="hover:bg-fg/5 flex items-center justify-between rounded-md px-3 py-2"
                  >
                    <span className="flex items-center gap-2">
                      Teams
                      {pendingTeamInvites > 0 && (
                        <span className="text-xs font-normal text-amber-700">
                          {pendingTeamInvites === 1 ? '1 invite' : `${pendingTeamInvites} invites`}
                        </span>
                      )}
                    </span>
                    {pendingTeamInvites > 0 && (
                      <span
                        aria-label={`${pendingTeamInvites} pending team invite${pendingTeamInvites === 1 ? '' : 's'}`}
                        className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white ring-2 ring-amber-200"
                      >
                        {pendingTeamInvites}
                      </span>
                    )}
                  </Link>
                </li>
              )}
              <li>
                <Link href="/tools" className="hover:bg-fg/5 block rounded-md px-3 py-2">
                  Host tools
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:bg-fg/5 block rounded-md px-3 py-2">
                  Pricing
                </Link>
              </li>
            </ul>

            <div className="border-border-base mt-4 border-t pt-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-fg/60 text-xs tracking-wide uppercase">Theme</span>
                <ThemeToggle current={theme} />
              </div>

              {user ? (
                <div className="space-y-3">
                  <Link
                    href="/profile"
                    className="hover:bg-fg/5 flex items-center gap-3 rounded-md px-2 py-1"
                  >
                    <span
                      className="bg-primary/15 text-primary flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold"
                      aria-hidden="true"
                    >
                      {user.initials}
                    </span>
                    <span className="text-fg/80 flex-1 truncate text-sm">{user.displayName}</span>
                    <span className="text-fg/60 text-xs">Profile →</span>
                  </Link>
                  <form action={signOut}>
                    <button
                      type="submit"
                      className="border-border-base hover:bg-fg/5 w-full rounded-md border px-3 py-2 text-sm"
                    >
                      Sign out
                    </button>
                  </form>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/login"
                    className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-2 text-center text-sm"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/login?mode=sign-up"
                    className="bg-primary hover:bg-primary/90 rounded-md px-3 py-2 text-center text-sm font-medium text-white"
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
