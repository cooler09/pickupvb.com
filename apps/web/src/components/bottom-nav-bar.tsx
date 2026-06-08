'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import type { Route } from 'next';

type Item = {
  href: Route;
  label: string;
  /** Matches `pathname.startsWith(match)` for active-route highlighting. */
  match: string;
  icon: ReactNode;
};

// 24×24 stroke icons matching the site's existing inline-SVG vocabulary.
// `aria-hidden` because the visible label below carries the accessible name.
const ICON_PROPS = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const ICON_EVENTS = (
  <svg {...ICON_PROPS}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const ICON_GROUPS = (
  <svg {...ICON_PROPS}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const ICON_TEAMS = (
  <svg {...ICON_PROPS}>
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" />
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </svg>
);

const ICON_PROFILE = (
  <svg {...ICON_PROPS}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const ICON_SIGN_IN = (
  <svg {...ICON_PROPS}>
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <polyline points="10 17 15 12 10 7" />
    <line x1="15" y1="12" x2="3" y2="12" />
  </svg>
);

function buildItems(isAuthenticated: boolean): Item[] {
  const items: Item[] = [
    { href: '/events', label: 'Events', match: '/events', icon: ICON_EVENTS },
    { href: '/groups', label: 'Groups', match: '/groups', icon: ICON_GROUPS },
    { href: '/teams', label: 'Teams', match: '/teams', icon: ICON_TEAMS },
  ];
  if (isAuthenticated) {
    items.push({ href: '/profile', label: 'Profile', match: '/profile', icon: ICON_PROFILE });
  } else {
    items.push({ href: '/login', label: 'Sign in', match: '/login', icon: ICON_SIGN_IN });
  }
  return items;
}

function isActive(pathname: string, match: string): boolean {
  // Exact match or one of the nested routes (`/events/123`, `/events/new`).
  return pathname === match || pathname.startsWith(`${match}/`);
}

/**
 * Returns a boolean that flips to `true` while the page is scrolling
 * downward past the first ~80px of the viewport — M3 bottom-nav spec
 * says the bar should retreat on scroll-down and reveal on scroll-up so
 * it doesn't fight thumb-zone content while the user is reading. We
 * coalesce reads through `requestAnimationFrame` so the listener stays
 * passive and the React setState only fires on direction change.
 *
 * The setState lives in the rAF callback rather than the effect body,
 * which keeps the React Compiler `react-hooks/set-state-in-effect` rule
 * happy — see [AGENTS.md § Pattern 5](../../../AGENTS.md).
 */
function useHideOnScroll(): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let last = typeof window === 'undefined' ? 0 : window.scrollY;
    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const cur = window.scrollY;
        const delta = cur - last;
        // Threshold prevents jitter from per-frame ±1px drift.
        if (Math.abs(delta) > 8) {
          setHidden(delta > 0 && cur > 80);
          last = cur;
        }
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return hidden;
}

export function BottomNavBar({ isAuthenticated }: { isAuthenticated: boolean }) {
  const pathname = usePathname() ?? '/';
  const hidden = useHideOnScroll();
  const items = buildItems(isAuthenticated);

  return (
    <nav
      aria-label="Primary"
      data-hidden={hidden ? 'true' : 'false'}
      className="border-border-base bg-md-surface-container shadow-elevation-2 fixed inset-x-0 bottom-0 z-40 border-t transition-transform duration-200 ease-out data-[hidden=true]:translate-y-full md:hidden"
    >
      <ul className="pb-safe grid h-16 grid-cols-4">
        {items.map((item) => {
          const active = isActive(pathname, item.match);
          return (
            <li key={item.href} className="contents">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`state-layer flex h-full flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium ${
                  active ? 'text-primary' : 'text-fg/70'
                }`}
              >
                <span aria-hidden className="flex h-6 w-6 items-center justify-center">
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Eliminate unused export to keep the typecheck output clean.
export type { Item as BottomNavItem };
