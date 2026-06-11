'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useWakeLock } from '@/components/use-wake-lock';

/**
 * Chromeless, dark, wake-locked full-screen wrapper for putting a live bracket
 * (and, soon, schedule / court board / dashboard) on a gym TV or a host's
 * tablet — "display mode", slice A of the tournament-displays bundle
 * (docs/audits/tournament-tools-workflow.md). A Pro-host perk; the gate lives
 * at the page that mounts this.
 *
 * How it works:
 * - `fixed inset-0` covers the site nav / footer / bottom-nav (the same takeover
 *   trick the scoreboard uses) so a kiosk shows only the board.
 * - `data-theme="dark"` pins this subtree to the dark token ramp regardless of
 *   the viewer's site theme. The nested-`data-theme` selectors in globals.css
 *   re-scope `--tw-color-*` / `--md-sys-color-*` for everything inside, so the
 *   token-based board (BoardView) renders dark with no restyle and no flash.
 * - `useWakeLock` keeps the screen awake; `.display-zoom` enlarges the board for
 *   across-the-gym legibility without touching component styles.
 *
 * `children` is the server-rendered board handed in from the page — a Server
 * Component subtree passed to a Client wrapper via the `children` slot is the
 * sanctioned RSC composition (only *functions* can't cross the boundary).
 */
export function DisplayShell({
  title,
  subtitle,
  meta,
  exitHref,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Right-aligned status line, e.g. "12 teams · updates live". */
  meta?: string;
  /** Where "Exit" returns to — the same view without `?display`. */
  exitHref: Route;
  children: React.ReactNode;
}) {
  useWakeLock();
  return (
    <div
      data-theme="dark"
      className="bg-background text-fg fixed inset-0 z-[60] flex flex-col overflow-hidden"
    >
      <header className="border-border-base flex items-center justify-between gap-4 border-b px-6 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
              <span className="bg-md-success absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
              <span className="bg-md-success relative inline-flex h-2.5 w-2.5 rounded-full" />
            </span>
            <h1 className="text-headline-sm text-fg truncate font-bold">{title}</h1>
          </div>
          {subtitle && <p className="text-muted truncate text-sm">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-4">
          {meta && <span className="text-muted hidden text-sm sm:inline">{meta}</span>}
          <Link
            href={exitHref}
            className="border-border-base text-muted hover:text-fg rounded-shape-sm border px-3 py-1.5 text-sm"
          >
            Exit
          </Link>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="display-zoom mx-auto max-w-6xl">{children}</div>
      </div>
    </div>
  );
}
