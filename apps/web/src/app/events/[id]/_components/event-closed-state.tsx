import Link from 'next/link';
import { primaryButtonClass, neutralButtonClass } from '@/components/primary-button';
import type { Route } from 'next';

type Props = {
  eventId: string;
  eventType: string;
  status: string;
  hasStarted: boolean;
  attendeeCount: number;
  isHost: boolean;
  /**
   * Whether the tournament has a host-created bracket. Non-hosts only get the
   * "View bracket" CTA once one exists; otherwise they're pointed at the
   * registered teams. Hosts always get it (the bracket page is where they build
   * it). Irrelevant for non-tournaments.
   */
  bracketExists: boolean;
};

/**
 * Replaces the bare "signups are closed" notice with a follow-up CTA so the
 * page stays useful once the event has started, completed, or been
 * cancelled.
 */
export function EventClosedState({
  eventId,
  eventType,
  status,
  hasStarted,
  attendeeCount,
  isHost,
  bracketExists,
}: Props) {
  if (status === 'cancelled') {
    return (
      <section
        className="border-secondary bg-secondary/10 text-fg rounded-shape-sm border p-4 text-sm"
        role="status"
      >
        <p className="font-semibold">This event was cancelled.</p>
        <p className="text-muted mt-1 text-xs">
          The host has called this event off. Reach out to them if you have questions.
        </p>
      </section>
    );
  }

  if (status === 'completed' || hasStarted) {
    const isTournament = eventType === 'tournament';
    const isLeague = eventType === 'league';
    // Only point at the bracket when one actually exists (or the viewer is the
    // host, who can create it there) — otherwise a non-host lands on an empty
    // "the host hasn't created a bracket" page. Without a bracket, send them to
    // the registered-teams roster instead.
    const showBracket = isTournament && (bracketExists || isHost);
    return (
      <section
        className="border-border-base bg-fg/5 rounded-shape-sm space-y-2 border p-4 text-sm"
        role="status"
      >
        <p className="text-fg font-semibold">
          {status === 'completed' ? 'This event is complete.' : 'Signups are closed.'}
        </p>
        <p className="text-muted text-xs">
          {status === 'completed'
            ? showBracket
              ? 'See the final bracket and results below.'
              : isLeague
                ? 'See the season schedule and final results.'
                : isTournament
                  ? 'See the registered teams below.'
                  : `Thanks to the ${attendeeCount} player${attendeeCount === 1 ? '' : 's'} who came out.`
            : 'This event has already started.'}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {showBracket && (
            <Link href={`/events/${eventId}/bracket` as Route} className={primaryButtonClass('sm')}>
              View bracket
            </Link>
          )}
          {isLeague && (
            <Link
              href={`/events/${eventId}/schedule` as Route}
              className={primaryButtonClass('sm')}
            >
              View schedule
            </Link>
          )}
          {!showBracket && !isLeague && (
            <a href={isTournament ? '#teams' : '#attendees'} className={primaryButtonClass('sm')}>
              {isTournament ? 'View teams' : 'View attendees'}
            </a>
          )}
          {isHost && status !== 'completed' && (
            <Link href={`/events/${eventId}/manage` as Route} className={neutralButtonClass('sm')}>
              Manage event
            </Link>
          )}
        </div>
      </section>
    );
  }

  return null;
}
