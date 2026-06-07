import Link from 'next/link';
import type { Route } from 'next';
import { primaryButtonClass } from '@/components/primary-button';

/** Host-only "You're hosting this event" banner with a link into the manage
 *  console. Extracted from events/[id]/page.tsx (architecture audit P3-1). */
export function EventManageBanner({ eventId }: { eventId: string }) {
  return (
    <div className="border-primary/30 bg-primary/5 rounded-shape-sm flex flex-wrap items-center justify-between gap-3 border p-4">
      <div className="min-w-0">
        <p className="text-fg text-sm font-semibold">You&apos;re hosting this event</p>
        <p className="text-muted text-xs">
          Edit details, manage registrations, message players, and record results.
        </p>
      </div>
      <Link href={`/events/${eventId}/manage` as Route} className={primaryButtonClass('md')}>
        Manage event
      </Link>
    </div>
  );
}
