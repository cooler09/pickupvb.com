import Link from 'next/link';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';
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

type Banner = { tone: 'success' | 'info' | 'error'; text: string };

function bannerFor(rsvp: string | undefined, rsvpMsg: string | undefined): Banner | null {
    switch (rsvp) {
        case 'joined':
            return { tone: 'success', text: "You're in! See you on the court." };
        case 'already':
            return { tone: 'info', text: "You're already signed up for this event." };
        case 'left':
            return { tone: 'info', text: "You've been removed from this event." };
        case 'notin':
            return { tone: 'info', text: "You weren't signed up for this event." };
        case 'full':
            return { tone: 'error', text: 'Sorry — this event is full.' };
        case 'signin':
            return { tone: 'error', text: 'Please sign in to RSVP.' };
        case 'anon':
            return {
                tone: 'info',
                text: 'Finish creating your account to RSVP from any device.',
            };
        case 'error':
            return { tone: 'error', text: rsvpMsg ?? 'Something went wrong. Try again.' };
        default:
            return null;
    }
}

const BANNER_CLASS: Record<Banner['tone'], string> = {
    success: 'rounded-md border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-primary',
    error: 'rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700',
    info: 'rounded-md border border-border-base bg-highlight/30 px-4 py-2 text-sm text-fg/80',
};

/**
 * Bottom-of-page RSVP UI for open-play published events:
 * - Optional flash banner driven by the `?rsvp=` query param
 * - Join / Leave buttons for signed-in users (Leave is confirmed)
 * - Sign-in CTA + guest signup form for anonymous / signed-out viewers
 */
export function RsvpPanel({
    eventId,
    eventTitle,
    isAttending,
    isRealUser,
    rsvp,
    rsvpMsg,
}: Props) {
    const banner = bannerFor(rsvp, rsvpMsg);
    return (
        <div className="space-y-4">
            {banner && (
                <div role="status" className={BANNER_CLASS[banner.tone]}>
                    {banner.text}
                </div>
            )}
            <div className="flex justify-end gap-2">
                {isAttending ? (
                    <>
                        <span className="rounded-md border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
                            You&apos;re signed up
                        </span>
                        <form action={leaveEvent.bind(null, eventId)}>
                            <ConfirmSubmitButton
                                label="Leave event"
                                pendingLabel="Leaving…"
                                confirmMessage="Remove yourself from this event?"
                                className="rounded-md border border-border-base px-4 py-2 text-sm font-medium text-fg/80 hover:bg-fg/5 disabled:opacity-50"
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
                        className="rounded-md border border-border-base px-4 py-2 text-sm font-medium hover:bg-fg/5"
                    >
                        Already have an account? Sign in
                    </Link>
                )}
            </div>

            {!isRealUser && !isAttending && (
                <section className="rounded-lg border border-border-base p-4">
                    <h2 className="text-sm font-semibold text-fg">Sign up as a guest</h2>
                    <p className="mb-3 text-xs text-muted">
                        No account needed — just your name.
                    </p>
                    <GuestSignupForm eventId={eventId} />
                </section>
            )}
        </div>
    );
}
