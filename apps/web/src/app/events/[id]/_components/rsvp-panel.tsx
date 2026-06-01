import Link from 'next/link';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';
import { ConfettiBurst } from '@/components/confetti-burst';
import { rsvpBannerFor, RSVP_BANNER_CLASS } from '@/lib/event-rsvp-flash';
import GuestSignupForm from '../guest-signup-form';
import { joinEvent, leaveEvent } from '../rsvp-actions';

type Props = {
  eventId: string;
  eventTitle: string;
  isAttending: boolean;
  isRealUser: boolean;
  rsvp: string | undefined;
  rsvpMsg: string | undefined;
};

/**
 * Bottom-of-page RSVP UI for open-play published events:
 * - Optional flash banner driven by the `?rsvp=` query param
 * - Join / Leave buttons for signed-in users (Leave is confirmed)
 * - Sign-in CTA + guest signup form for anonymous / signed-out viewers
 */
export function RsvpPanel({ eventId, eventTitle, isAttending, isRealUser, rsvp, rsvpMsg }: Props) {
  const banner = rsvpBannerFor(rsvp, rsvpMsg);
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
      <div className="flex justify-end gap-2">
        {isAttending ? (
          <>
            <span className="border-primary/30 bg-primary/10 text-primary rounded-md border px-4 py-2 text-sm font-medium">
              You&apos;re signed up
            </span>
            <form action={leaveEvent.bind(null, eventId)}>
              <ConfirmSubmitButton
                label="Leave event"
                pendingLabel="Leaving…"
                confirmMessage="Remove yourself from this event?"
                destructive
                className="border-border-base text-fg/80 hover:bg-fg/5 rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
              />
            </form>
          </>
        ) : isRealUser ? (
          <form action={joinEvent.bind(null, eventId)}>
            <ConfirmSubmitButton
              label="Join this event"
              pendingLabel="Joining…"
              confirmMessage={`Join "${eventTitle}"? You'll be added to the attendee list.`}
            />
          </form>
        ) : (
          <Link
            href={`/login?next=/events/${eventId}`}
            className="border-border-base hover:bg-fg/5 rounded-md border px-4 py-2 text-sm font-medium"
          >
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
