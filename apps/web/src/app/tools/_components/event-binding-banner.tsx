import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import { neutralButtonClass } from '@/components/primary-button';

/**
 * "Connected to your event" banner shown above a host tool when it carries an
 * {@link EventToolBinding} (tools/_lib/event-binding.ts). Presentational and
 * directive-free, so it renders both in a server tool page (scheduler/standings)
 * and inside a client island that owns a "Save to event" button (randomizer/
 * seeding) — the island passes that button as `children`.
 *
 * Always renders a "Back to event" link to `ret`. See
 * docs/audits/tournament-tools-workflow.md (TT-3).
 */
export function EventBindingBanner({
  eventTitle,
  divisionLabel,
  ret,
  children,
}: {
  eventTitle: string;
  divisionLabel?: string | undefined;
  ret: string;
  children?: ReactNode;
}) {
  return (
    <div className="border-primary/30 bg-primary/5 rounded-shape-sm flex flex-wrap items-center justify-between gap-3 border p-4">
      <div className="min-w-0">
        <p className="text-primary text-xs font-semibold tracking-wide uppercase">
          Connected to your event
        </p>
        <p className="text-fg truncate text-sm font-medium">
          {eventTitle}
          {divisionLabel ? (
            <span className="text-muted font-normal"> · {divisionLabel}</span>
          ) : null}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <Link href={ret as Route} className={neutralButtonClass('sm')}>
          Back to event
        </Link>
      </div>
    </div>
  );
}
