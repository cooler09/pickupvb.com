import Link from 'next/link';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';
import { SubmitButton } from '@/components/submit-button';
import { StatusPill } from '@/components/status-pill';
import { ConfettiBurst } from '@/components/confetti-burst';
import { primaryButtonClass, neutralButtonClass } from '@/components/primary-button';
import { rsvpBannerFor, RSVP_BANNER_CLASS } from '@/lib/event-rsvp-flash';
import GuestSignupForm from '../guest-signup-form';
import { joinEvent, joinWaitlist, leaveEvent, leaveWaitlist } from '../rsvp-actions';

type Props = {
  eventId: string;
  eventTitle: string;
  isAttending: boolean;
  isRealUser: boolean;
  /** True when the event is at fixed capacity (spotsRemaining === 0). */
  isFull: boolean;
  /** The viewer's 1-based waitlist place, or null if not queued (ADR 0036). */
  waitlistPosition: number | null;
  /** Total players queued. */
  waitlistCount: number;
  rsvp: string | undefined;
  rsvpMsg: string | undefined;
};

/**
 * Bottom-of-page RSVP UI for open-play published events:
 * - Optional flash banner driven by the `?rsvp=` query param
 * - Join / Leave buttons for signed-in users (Leave is confirmed)
 * - When full: a real "Join waitlist" action (ADR 0036); a queued viewer sees
 *   their place + a "Leave waitlist" button
 * - Sign-in CTA + guest signup form for anonymous / signed-out viewers
 */
export function RsvpPanel({
  eventId,
  eventTitle,
  isAttending,
  isRealUser,
  isFull,
  waitlistPosition,
  waitlistCount,
  rsvp,
  rsvpMsg,
}: Props) {
  const banner = rsvpBannerFor(rsvp, rsvpMsg);
  const isWaitlisted = waitlistPosition !== null;
  return (
    <div className="space-y-4">
      {banner && (
        <div role="status" className={`relative ${RSVP_BANNER_CLASS[banner.tone]}`}>
          {banner.tone === 'success' && <ConfettiBurst />}
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
      <div className="flex flex-wrap items-center justify-end gap-2">
        {isAttending ? (
          <>
            <StatusPill tone="primary">You&apos;re signed up</StatusPill>
            <form action={leaveEvent.bind(null, eventId)}>
              <ConfirmSubmitButton
                label="Leave event"
                pendingLabel="Leaving…"
                confirmMessage="Remove yourself from this event?"
                destructive
                className={neutralButtonClass('md')}
              />
            </form>
          </>
        ) : isWaitlisted ? (
          <>
            <StatusPill tone="neutral">You&apos;re #{waitlistPosition} on the waitlist</StatusPill>
            <form action={leaveWaitlist.bind(null, eventId)}>
              <SubmitButton className={neutralButtonClass('md')}>Leave waitlist</SubmitButton>
            </form>
          </>
        ) : isRealUser && isFull ? (
          <form action={joinWaitlist.bind(null, eventId)} className="text-right">
            <SubmitButton className={primaryButtonClass('md')}>Join waitlist</SubmitButton>
            {waitlistCount > 0 && (
              <p className="text-muted mt-1 text-xs">
                {waitlistCount} {waitlistCount === 1 ? 'person' : 'people'} ahead of you
              </p>
            )}
          </form>
        ) : isRealUser ? (
          <form action={joinEvent.bind(null, eventId)}>
            <ConfirmSubmitButton
              label="Join this event"
              pendingLabel="Joining…"
              confirmMessage={`Join "${eventTitle}"? You'll be added to the attendee list.`}
            />
          </form>
        ) : (
          <Link href={`/login?next=/events/${eventId}`} className={neutralButtonClass('md')}>
            Already have an account? Sign in
          </Link>
        )}
      </div>

      {!isRealUser && !isAttending && (
        <section className="rounded-shape-sm border-border-base border p-4">
          <h2 className="text-fg text-sm font-semibold">Sign up as a guest</h2>
          <p className="text-muted mb-3 text-xs">No account needed — just your name.</p>
          <GuestSignupForm eventId={eventId} />
        </section>
      )}
    </div>
  );
}
