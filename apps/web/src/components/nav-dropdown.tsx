'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Route } from 'next';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';

export type NavDropdownItem = {
  href: Route;
  label: string;
  /** Optional badge content rendered to the right of the label. */
  badge?: React.ReactNode;
};

type Props = {
  label: string;
  items: NavDropdownItem[];
  /** When true, renders a small dot on the trigger to flag activity inside. */
  hasIndicator?: boolean;
  /** Accessible label for the indicator dot, if present. */
  indicatorLabel?: string;
};

/**
 * Desktop nav dropdown built on `@radix-ui/react-dropdown-menu` — the
 * primitive owns focus management, arrow-key navigation, typeahead,
 * Escape-to-close (returns focus to the trigger), and click-outside
 * dismissal. We add one bit Radix doesn't: closing the menu on
 * Next.js route change so navigating to a child link doesn't leave
 * a stale menu behind (Radix closes when the trigger unmounts but
 * client-side navigation doesn't unmount the header).
 *
 * Public API matches the pre-Radix implementation exactly so
 * [site-header.tsx](./site-header.tsx) needs no edits.
 */
export function NavDropdown({ label, items, hasIndicator, indicatorLabel }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on route change. Radix doesn't auto-close on client-side
  // navigation because the trigger stays mounted; this matches the
  // behavior of the pre-Radix implementation. setState is deferred
  // to a rAF callback per AGENTS.md Pattern 5 (no sync setState in
  // an effect body).
  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(false));
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  return (
    <RadixDropdownMenu.Root open={open} onOpenChange={setOpen}>
      <RadixDropdownMenu.Trigger asChild>
        <button type="button" className="hover:text-primary inline-flex items-center gap-1">
          <span className="relative">
            {label}
            {hasIndicator && (
              <span
                aria-label={indicatorLabel ?? 'New activity'}
                className="absolute -top-1 -right-2 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-[var(--color-surface,white)]"
              />
            )}
          </span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="transition-transform data-[state=open]:rotate-180"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </RadixDropdownMenu.Trigger>
      <RadixDropdownMenu.Portal>
        <RadixDropdownMenu.Content
          align="start"
          sideOffset={8}
          aria-label={label}
          className="md-menu-motion border-border-base bg-md-surface-container-high text-fg shadow-elevation-2 z-50 min-w-[12rem] overflow-hidden rounded-md border py-1"
        >
          {items.map((item) => (
            <RadixDropdownMenu.Item key={item.href} asChild>
              <Link
                href={item.href}
                className="state-layer data-[highlighted]:bg-fg/5 flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm outline-none"
              >
                <span>{item.label}</span>
                {item.badge ? <span className="shrink-0">{item.badge}</span> : null}
              </Link>
            </RadixDropdownMenu.Item>
          ))}
        </RadixDropdownMenu.Content>
      </RadixDropdownMenu.Portal>
    </RadixDropdownMenu.Root>
  );
}
