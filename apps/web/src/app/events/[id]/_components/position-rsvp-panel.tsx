import Link from 'next/link';
import { primaryButtonClass } from '@/components/primary-button';
import { EVENT_POSITIONS, type EventPosition } from '@pickupvb/domain';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';
import { POSITION_LABEL } from '@/lib/enum-labels';
import { rsvpBannerFor, RSVP_BANNER_CLASS } from '@/lib/event-rsvp-flash';
import GuestSignupForm from '../guest-signup-form';
import { joinEventAtPosition, leaveEvent } from '../rsvp-actions';

type Props = {
  eventId: string;
  eventTitle: string;
  isAttending: boolean;
  isRealUser: boolean;
  /** `{ setter: 1, outside: 2, ... }` (only positions with count > 0). */
  positionRoster: Partial<Record<EventPosition, number>>;
  /** Per-position counts of who has already signed up (waitlisted included). */
  filledByPosition: Partial<Record<EventPosition, number>>;
  /** Position the viewer chose, if they're attending. */
  viewerPosition: EventPosition | null;
  rsvp: string | undefined;
  rsvpMsg: string | undefined;
};

/**
 * RSVP panel for open-play events that use positional sign-up. Shows one
 * "Sign up as <Position> (filled / target)" button per configured position.
 * Over-fill is allowed: when filled ≥ target, the next signup is flagged
 * "waitlist" but still goes through.
 */
export function PositionRsvpPanel({
  eventId,
  eventTitle,
  isAttending,
  isRealUser,
  positionRoster,
  filledByPosition,
  viewerPosition,
  rsvp,
  rsvpMsg,
}: Props) {
  const banner = rsvpBannerFor(rsvp, rsvpMsg, {
    full: { tone: 'error', text: 'Sorry — that position is full.' },
  });
  const positions = EVENT_POSITIONS.filter((p) => (positionRoster[p] ?? 0) > 0);
  return (
    <div className="space-y-4">
      {banner && (
        <div role="status" className={RSVP_BANNER_CLASS[banner.tone]}>
          {banner.text}
          {rsvp === 'guest_joined' && (
            <>
              {' '}
              <Link href={`/claim?next=/events/${eventId}`} className="font-semibold underline">
                Finish creating your account →
              </Link>
            </>
          )}
        </div>
      )}

      {isAttending ? (
        <div className="border-primary/30 bg-primary/10 text-primary flex items-center justify-between gap-2 rounded-md border px-4 py-2 text-sm">
          <span className="font-medium">
            You&apos;re signed up
            {viewerPosition && <> as {POSITION_LABEL[viewerPosition] ?? viewerPosition}</>}
          </span>
          <form action={leaveEvent.bind(null, eventId)}>
            <ConfirmSubmitButton
              label="Leave event"
              pendingLabel="Leaving…"
              confirmMessage="Remove yourself from this event?"
              destructive
              className="border-border-base text-fg/80 hover:bg-fg/5 rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            />
          </form>
        </div>
      ) : isRealUser ? (
        <div className="space-y-2">
          <p className="text-muted text-sm">Pick a position to join:</p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {positions.map((pos) => {
              const target = positionRoster[pos] ?? 0;
              const filled = filledByPosition[pos] ?? 0;
              const overFull = filled >= target;
              return (
                <li
                  key={pos}
                  className="border-border-base flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span className="text-fg font-medium">{POSITION_LABEL[pos] ?? pos}</span>{' '}
                    <span className="text-muted">
                      ({filled}/{target})
                    </span>
                    {overFull && (
                      <span className="bg-md-warning/15 text-md-warning ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                        Waitlist
                      </span>
                    )}
                  </span>
                  <form action={joinEventAtPosition.bind(null, eventId, pos)}>
                    <ConfirmSubmitButton
                      label={overFull ? 'Join waitlist' : 'Join'}
                      pendingLabel="Joining…"
                      confirmMessage={
                        overFull
                          ? `"${POSITION_LABEL[pos] ?? pos}" is full. Join the waitlist for "${eventTitle}"?`
                          : `Join "${eventTitle}" as ${POSITION_LABEL[pos] ?? pos}?`
                      }
                      className={primaryButtonClass('sm')}
                    />
                  </form>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="flex justify-end">
          <Link
            href={`/login?next=/events/${eventId}`}
            className="border-border-base hover:bg-fg/5 rounded-md border px-4 py-2 text-sm font-medium"
          >
            Already have an account? Sign in
          </Link>
        </div>
      )}

      {!isRealUser && !isAttending && (
        <section className="rounded-shape-sm border-border-base border p-4">
          <h2 className="text-fg text-sm font-semibold">Sign up as a guest</h2>
          <p className="text-muted mb-3 text-xs">
            No account needed — just your name. (A host will pick your position.)
          </p>
          <GuestSignupForm eventId={eventId} />
        </section>
      )}
    </div>
  );
}
