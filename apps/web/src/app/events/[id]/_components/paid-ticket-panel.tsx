import Link from 'next/link';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';
import { startTicketCheckout, startGuestTicketCheckout } from '../checkout-actions';
import { leaveEvent } from '../rsvp-actions';

type Props = {
    eventId: string;
    eventTitle: string;
    isAttending: boolean;
    isRealUser: boolean;
    ticketCents: number;
    platformFeeCents: number;
    refundWindowHours: number;
};

function formatUsd(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Replaces RsvpPanel for paid open-play events. Authenticated users get a
 * "Buy ticket" button; guests get a name + email form to start checkout.
 *
 * Refunds: hosts can issue refunds from their Stripe dashboard for now.
 * In-app self-cancel-with-refund is a follow-up (Phase 2.B).
 */
export function PaidTicketPanel({
    eventId,
    eventTitle,
    isAttending,
    isRealUser,
    ticketCents,
    platformFeeCents,
    refundWindowHours,
}: Props) {
    const total = ticketCents + platformFeeCents;
    return (
        <div className="space-y-4">
            <div className="rounded-lg border border-border-base bg-fg/5 p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Ticket
                </h2>
                <p className="mt-1 text-2xl font-bold text-fg">{formatUsd(total)}</p>
                {platformFeeCents > 0 && (
                    <p className="text-xs text-muted">
                        Includes {formatUsd(ticketCents)} ticket +{' '}
                        {formatUsd(platformFeeCents)} service fee
                    </p>
                )}
                {platformFeeCents === 0 && (
                    <p className="text-xs text-muted">Service fee absorbed by host</p>
                )}
            </div>

            {isAttending ? (
                <div className="flex flex-col items-end gap-2">
                    <span className="rounded-md border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
                        You&apos;re signed up
                    </span>
                    <form action={leaveEvent.bind(null, eventId)}>
                        <ConfirmSubmitButton
                            label="Cancel ticket & refund"
                            pendingLabel="Refunding…"
                            confirmMessage={`Cancel your ticket to "${eventTitle}" and request a refund of ${formatUsd(total)}?`}
                        />
                    </form>
                    <p className="text-xs text-muted">
                        Refunds available up to {refundWindowHours} hour
                        {refundWindowHours === 1 ? '' : 's'} before the event starts.
                    </p>
                </div>
            ) : isRealUser ? (
                <div className="flex justify-end">
                    <form action={startTicketCheckout.bind(null, eventId)}>
                        <ConfirmSubmitButton
                            label={`Buy ticket — ${formatUsd(total)}`}
                            pendingLabel="Redirecting to Stripe…"
                            confirmMessage={`Buy a ticket to "${eventTitle}" for ${formatUsd(total)}?`}
                        />
                    </form>
                </div>
            ) : (
                <>
                    <div className="flex justify-end">
                        <Link
                            href={`/login?next=/events/${eventId}`}
                            className="rounded-md border border-border-base px-4 py-2 text-sm font-medium hover:bg-fg/5"
                        >
                            Sign in to buy
                        </Link>
                    </div>
                    <section className="rounded-lg border border-border-base p-4">
                        <h2 className="text-sm font-semibold text-fg">
                            Or buy as a guest
                        </h2>
                        <p className="mb-3 text-xs text-muted">
                            We need an email to send your receipt + cancellation link.
                        </p>
                        <form
                            action={startGuestTicketCheckout.bind(null, eventId)}
                            className="space-y-3"
                        >
                            <div>
                                <label
                                    htmlFor="guest-name"
                                    className="block text-xs font-medium text-fg"
                                >
                                    Your name
                                </label>
                                <input
                                    id="guest-name"
                                    name="display_name"
                                    required
                                    maxLength={80}
                                    className="mt-1 w-full rounded-md border border-border-base bg-background px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label
                                    htmlFor="guest-email"
                                    className="block text-xs font-medium text-fg"
                                >
                                    Email
                                </label>
                                <input
                                    id="guest-email"
                                    name="email"
                                    type="email"
                                    required
                                    className="mt-1 w-full rounded-md border border-border-base bg-background px-3 py-2 text-sm"
                                />
                            </div>
                            <div className="flex justify-end">
                                <ConfirmSubmitButton
                                    label={`Continue — ${formatUsd(total)}`}
                                    pendingLabel="Redirecting…"
                                    confirmMessage={`Continue to Stripe to pay ${formatUsd(total)}?`}
                                />
                            </div>
                        </form>
                    </section>
                </>
            )}
        </div>
    );
}
