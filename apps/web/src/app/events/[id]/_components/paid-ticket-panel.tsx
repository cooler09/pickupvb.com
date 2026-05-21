import Link from 'next/link';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';
import { SubmitButton } from '@/components/submit-button';
import { startTicketCheckout, startGuestTicketCheckout } from '../checkout-actions';
import GuestSignupForm from '../guest-signup-form';
import { joinEvent, leaveEvent } from '../rsvp-actions';

type Props = {
  eventId: string;
  eventTitle: string;
  isAttending: boolean;
  isRealUser: boolean;
  ticketCents: number;
  platformFeeCents: number;
  refundWindowHours: number;
  /** Viewer's own payment status, used to colour the "you're in" pill. */
  viewerPaymentStatus?: 'paid' | 'pending' | 'none';
};

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const PAYMENT_PILL: Record<'paid' | 'pending' | 'none', { label: string; className: string }> = {
  paid: {
    label: "You're in — paid",
    className:
      'rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800',
  },
  pending: {
    label: "You're in — payment pending",
    className:
      'rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900',
  },
  none: {
    label: "You're in — pay the host",
    className:
      'rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900',
  },
};

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
  viewerPaymentStatus,
}: Props) {
  const total = ticketCents + platformFeeCents;
  const pill = viewerPaymentStatus
    ? PAYMENT_PILL[viewerPaymentStatus]
    : {
        label: "You're signed up",
        className:
          'rounded-md border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary',
      };
  return (
    <div className="space-y-4">
      <div className="border-border-base overflow-hidden rounded-lg border sm:grid sm:grid-cols-2">
        <div className="bg-fg/5 sm:border-border-base p-4 sm:border-r">
          <h2 className="text-muted text-xs font-semibold tracking-wide uppercase">
            Pay in person
          </h2>
          <p className="text-fg mt-1 text-2xl font-bold">{formatUsd(ticketCents)}</p>
          <p className="text-muted text-xs">
            Cash, Venmo, etc. — settle up with the host at the event.
          </p>
        </div>
        <div className="border-border-base bg-fg/5 border-t p-4 sm:border-t-0 sm:border-l-0">
          <h2 className="text-muted text-xs font-semibold tracking-wide uppercase">Pay online</h2>
          <p className="text-fg mt-1 text-2xl font-bold">{formatUsd(total)}</p>
          {platformFeeCents > 0 ? (
            <p className="text-muted text-xs">
              {formatUsd(ticketCents)} to the host + {formatUsd(platformFeeCents)} service fee
            </p>
          ) : (
            <p className="text-muted text-xs">Service fee absorbed by host</p>
          )}
        </div>
      </div>

      {isAttending ? (
        <div className="flex flex-col items-end gap-2">
          <span className={pill.className}>{pill.label}</span>
          {viewerPaymentStatus === 'paid' ? (
            <>
              <form action={leaveEvent.bind(null, eventId)}>
                <ConfirmSubmitButton
                  label="Cancel sign-up & refund"
                  pendingLabel="Refunding…"
                  confirmMessage={`Cancel your sign-up for "${eventTitle}" and request a refund of ${formatUsd(total)}?`}
                  destructive
                />
              </form>
              <p className="text-muted text-xs">
                Refunds available up to {refundWindowHours} hour
                {refundWindowHours === 1 ? '' : 's'} before the event starts.
              </p>
            </>
          ) : (
            <form action={leaveEvent.bind(null, eventId)}>
              <ConfirmSubmitButton
                label="Cancel sign-up"
                pendingLabel="Cancelling…"
                confirmMessage={`Cancel your sign-up for "${eventTitle}"?`}
                destructive
              />
            </form>
          )}
        </div>
      ) : isRealUser ? (
        <div className="space-y-3">
          <form action={joinEvent.bind(null, eventId)} className="flex justify-end">
            <ConfirmSubmitButton
              label={`Sign up — pay the host ${formatUsd(ticketCents)}`}
              pendingLabel="Signing up…"
              confirmMessage={`Sign up for "${eventTitle}" and pay the host ${formatUsd(ticketCents)} in person (cash, Venmo, etc.)?`}
            />
          </form>
          <div className="flex flex-col items-end gap-1">
            <form action={startTicketCheckout.bind(null, eventId)}>
              <SubmitButton className="border-border-base text-fg/70 hover:bg-fg/5 rounded-md border px-3 py-1.5 text-xs disabled:opacity-50">
                Or pay online now — {formatUsd(total)}
              </SubmitButton>
            </form>
            <p className="text-muted max-w-[18rem] text-right text-[10px]">
              Includes {formatUsd(platformFeeCents)} service fee. Paying in person? Skip this.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <section className="border-border-base rounded-lg border p-4">
            <h2 className="text-fg text-sm font-semibold">
              Sign up & pay the host {formatUsd(ticketCents)} in person
            </h2>
            <p className="text-muted mb-3 text-xs">
              No account needed — just your name. You&apos;ll settle up with the host at the event
              (cash, Venmo, etc.).
            </p>
            <GuestSignupForm eventId={eventId} />
          </section>

          <section className="border-border-base rounded-lg border p-4">
            <h2 className="text-fg text-sm font-semibold">
              Or pay online now — {formatUsd(total)}
            </h2>
            <p className="text-muted mb-3 text-xs">
              Includes {formatUsd(platformFeeCents)} service fee. We need an email to send your
              receipt + cancellation link.
            </p>
            <form action={startGuestTicketCheckout.bind(null, eventId)} className="space-y-3">
              <div>
                <label htmlFor="guest-name" className="text-fg block text-xs font-medium">
                  Your name
                </label>
                <input
                  id="guest-name"
                  name="display_name"
                  required
                  maxLength={80}
                  className="border-border-base bg-background mt-1 w-full rounded-md border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="guest-email" className="text-fg block text-xs font-medium">
                  Email
                </label>
                <input
                  id="guest-email"
                  name="email"
                  type="email"
                  required
                  className="border-border-base bg-background mt-1 w-full rounded-md border px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end">
                <ConfirmSubmitButton
                  label={`Pay online — ${formatUsd(total)}`}
                  pendingLabel="Redirecting…"
                  confirmMessage={`Continue to Stripe to pay ${formatUsd(total)}?`}
                />
              </div>
            </form>
          </section>

          <p className="text-muted text-center text-xs">
            Already have an account?{' '}
            <Link href={`/login?next=/events/${eventId}`} className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
