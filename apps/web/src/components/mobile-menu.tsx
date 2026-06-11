'use client';

import { useEffect, useRef, useState } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { primaryButtonClass, secondaryButtonClass } from '@/components/primary-button';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ThemePreference } from '@/lib/theme';
import { SubmitButton } from '@/components/submit-button';
import { ThemeToggle } from './theme-toggle';
import { signOut } from './actions';

type Props = {
  theme: ThemePreference;
  user: { displayName: string; initials: string } | null;
  /** Number of unanswered team invites for the signed-in user. */
  pendingTeamInvites: number;
};

export function MobileMenu({ theme, user, pendingTeamInvites }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Track pathname across renders so we only close on actual navigations
  // (avoids the cascading-setState-in-effect warning by skipping the initial
  // mount and only acting when pathname genuinely changes).
  const lastPathnameRef = useRef(pathname);

  // Close drawer on route change. Guarded by a ref so the effect doesn't
  // call setState on its initial run — only on actual navigations.
  useEffect(() => {
    if (lastPathnameRef.current === pathname) return;
    lastPathnameRef.current = pathname;
    setOpen(false);
  }, [pathname]);

  return (
    <div className="md:hidden">
      <RadixDialog.Root open={open} onOpenChange={setOpen}>
        <RadixDialog.Trigger asChild>
          <button
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="border-border-base text-fg hover:bg-fg/5 tap-target rounded-md border"
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
        </RadixDialog.Trigger>

        <RadixDialog.Portal>
          <RadixDialog.Overlay className="md-dialog-overlay fixed inset-0 z-40 bg-black/40" />
          <RadixDialog.Content
            aria-describedby={undefined}
            className="border-border-base bg-md-surface-container fixed inset-x-0 top-[57px] z-50 border-b px-4 py-4 shadow-lg"
          >
            <RadixDialog.Title className="sr-only">Main menu</RadixDialog.Title>
            {/* Primary destinations (Events / Groups / Teams / Profile) moved
                to `<BottomNav>` in Bundle 5. The hamburger now carries
                secondary destinations only, per M3 spec once a bottom nav
                is present. */}
            <ul className="flex flex-col gap-1 text-base">
              <li>
                <Link href="/events/new" className="hover:bg-fg/5 block rounded-md px-3 py-2">
                  Host an event
                </Link>
              </li>
              <li>
                <Link href="/community" className="hover:bg-fg/5 block rounded-md px-3 py-2">
                  Community feed
                </Link>
              </li>
              <li>
                <Link href="/players" className="hover:bg-fg/5 block rounded-md px-3 py-2">
                  Players
                </Link>
              </li>
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
              {user && pendingTeamInvites > 0 && (
                <li>
                  <Link
                    href="/teams"
                    className="hover:bg-fg/5 flex items-center justify-between rounded-md px-3 py-2"
                  >
                    <span className="flex items-center gap-2">
                      Team invites
                      <span className="text-md-warning text-xs font-normal">
                        {pendingTeamInvites === 1 ? '1 pending' : `${pendingTeamInvites} pending`}
                      </span>
                    </span>
                    <span
                      aria-label={`${pendingTeamInvites} pending team invite${pendingTeamInvites === 1 ? '' : 's'}`}
                      className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white ring-2 ring-amber-200"
                    >
                      {pendingTeamInvites}
                    </span>
                  </Link>
                </li>
              )}
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
                    <SubmitButton className="border-border-base hover:bg-fg/5 w-full rounded-md border px-3 py-2 text-sm disabled:opacity-50">
                      Sign out
                    </SubmitButton>
                  </form>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link href="/login" className={secondaryButtonClass('md')}>
                    Sign in
                  </Link>
                  <Link href="/login?mode=sign-up" className={primaryButtonClass('md')}>
                    Sign up
                  </Link>
                </div>
              )}
            </div>
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>
    </div>
  );
}
