import Link from 'next/link';
import type { Route } from 'next';
import { primaryButtonClass, secondaryButtonClass } from '@/components/primary-button';
import type { Timeframe } from './event-timeframe-tabs';

/** Why the Following tab has nothing to show (drives the empty-state copy). */
export type FollowingEmptyReason = 'not_signed_in' | 'no_follows' | null;

/** Empty-state panel for the events list — copy + CTAs vary by tab / filters /
 *  follow state. Extracted from events/page.tsx (architecture audit P3-1). */
export function EventsEmptyState({
  when,
  reason,
  hasAnyFilter,
  clearAllHref,
  canHost,
}: {
  when: Timeframe;
  reason: FollowingEmptyReason;
  hasAnyFilter: boolean;
  clearAllHref: Route;
  canHost: boolean;
}) {
  let title = 'No events match your filters';
  let body: string | null = null;
  if (when === 'past') {
    title = 'No past events match your filters';
  } else if (when === 'following') {
    if (reason === 'not_signed_in') {
      title = 'Sign in to see events from people you follow';
      body = "We'll personalize your feed once you're signed in.";
    } else if (reason === 'no_follows') {
      title = "You're not following anyone yet";
      body = 'Follow players from any event page to see their upcoming events here.';
    } else {
      title = 'No upcoming events from people you follow';
      body = 'Try the Upcoming tab to see more events near you.';
    }
  } else if (!hasAnyFilter) {
    title = 'No upcoming events yet';
    body = canHost
      ? 'Be the first to host one in your area.'
      : 'Check back soon or sign in to host an event.';
  } else {
    body = 'Try clearing a filter or widening your radius.';
  }

  return (
    <div className="border-border-base bg-surface rounded-shape-sm border p-8 text-center">
      <h3 className="text-fg text-base font-semibold">{title}</h3>
      {body && <p className="text-muted mt-1 text-sm">{body}</p>}
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        {hasAnyFilter && (
          <Link href={clearAllHref} className={secondaryButtonClass('sm')}>
            Clear filters
          </Link>
        )}
        {when === 'following' && reason === 'not_signed_in' && (
          <Link href="/login" className={primaryButtonClass('sm')}>
            Sign in
          </Link>
        )}
        {canHost && (
          <Link href="/events/new" className={primaryButtonClass('sm')}>
            Host an event
          </Link>
        )}
      </div>
    </div>
  );
}
