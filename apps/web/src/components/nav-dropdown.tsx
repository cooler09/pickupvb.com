'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Route } from 'next';

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
 * Accessible desktop nav dropdown. Click (or Enter/Space) toggles open;
 * Escape closes and returns focus to the trigger; click-outside dismisses;
 * the popup also closes on route change so navigating to a child link
 * doesn't leave a stale menu behind.
 */
export function NavDropdown({ label, items, hasIndicator, indicatorLabel }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const pathname = usePathname();
  const lastPathnameRef = useRef(pathname);
  const menuId = useId();

  // Close on route change (skip the initial mount so we don't fight focus).
  useEffect(() => {
    if (lastPathnameRef.current === pathname) return;
    lastPathnameRef.current = pathname;
    setOpen(false);
  }, [pathname]);

  // Escape closes + returns focus; click-outside dismisses.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="hover:text-primary inline-flex items-center gap-1"
      >
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
          className={open ? 'rotate-180 transition-transform' : 'transition-transform'}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="border-border-base bg-surface absolute top-full left-0 z-50 mt-2 min-w-[12rem] overflow-hidden rounded-md border shadow-lg"
        >
          <ul className="py-1">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  role="menuitem"
                  className="hover:bg-fg/5 flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  onClick={() => setOpen(false)}
                >
                  <span>{item.label}</span>
                  {item.badge ? <span className="shrink-0">{item.badge}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
