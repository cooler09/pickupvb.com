import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';

/**
 * M3 Floating Action Button (Bundle 5 — partial close of P2 #10). 56 dp
 * circle, primary-container color, elevation-3, bottom-right with a 16 dp
 * inset stacked above `BottomNav`. Per M3 spec, one FAB per page maximum,
 * surfacing the page's single most-likely host action; skip on read-only
 * pages. Render gated by viewer state (e.g. signed-in only) is the
 * caller's responsibility — the primitive doesn't know which action it's
 * surfacing.
 *
 * `bottom` math: `BottomNav` is `h-16` (4 rem) and visible below `md`, so
 * mobile FABs clear it with `bottom-20`; desktop drops to `md:bottom-6`
 * since the bottom nav is hidden there. `pr-safe` / `pb-safe` aren't
 * applied directly because `right-4` / `bottom-20` already provide
 * generous inset; iOS notch / home-indicator users get the additional
 * margin via the BottomNav's own `pb-safe`.
 *
 * Pass `label` for accessibility — the visible `children` are typically
 * an icon-only SVG (`aria-hidden`) plus optional extended-FAB text.
 */
export function Fab({
  href,
  label,
  children,
  extended = false,
}: {
  href: Route;
  /** Accessible name. Required because the visible content is usually an icon. */
  label: string;
  /** Visible content — typically `<Icon /> [optional label]`. */
  children: ReactNode;
  /** Render as the extended FAB shape (rectangular pill with text). */
  extended?: boolean;
}) {
  const shape = extended
    ? 'h-14 rounded-shape-lg px-4 gap-2'
    : 'h-14 w-14 rounded-shape-lg justify-center';
  return (
    <Link
      href={href}
      aria-label={label}
      className={`state-layer bg-md-primary-container text-md-on-primary-container shadow-elevation-3 hover:shadow-elevation-4 fixed right-4 bottom-20 z-30 inline-flex items-center text-sm font-semibold md:right-6 md:bottom-6 ${shape}`}
    >
      {children}
    </Link>
  );
}
