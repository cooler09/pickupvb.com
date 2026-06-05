import Link from 'next/link';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';
import { StatusPill, type StatusPillTone } from '@/components/status-pill';
import { startTicketCheckout, startGuestTicketCheckout } from '../checkout-actions';
import GuestSignupForm from '../guest-signup-form';
import { GuestSignupFields } from './guest-signup-fields';
import { joinEvent, leaveEvent } from '../rsvp-actions';

type Props = {
  eventId: string;
  eventTitle: string;
  isAttending: boolean;
  isRealUser: boolean;
  ticketCents: number;
  platformFeeCents: number;
  processingFeeCents: number;
  refundWindowHours: number;
  /**
   * When true, the host is collecting payment outside the app (cash,
   * Venmo, etc.). The panel shows a single "reserve spot — pay the host"
   * CTA and hides the Stripe path entirely.
   */
  paymentsOffPlatform: boolean;
  /** Viewer's own payment status, used to colour the "you're in" pill. */
  viewerPaymentStatus?: 'paid' | 'pending' | 'none';
};

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const PAYMENT_PILL: Record<'paid' | 'pending' | 'none', { label: string; tone: StatusPillTone }> = {
  paid: { label: "You're in — paid", tone: 'success' },
  pending: { label: "You're in — payment pending", tone: 'pending' },
  none: { label: "You're in — pay the host", tone: 'pending' },
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
  processingFeeCents,
  refundWindowHours,
  paymentsOffPlatform,
  viewerPaymentStatus,
}: Props) {
  const total = ticketCents + platformFeeCents + processingFeeCents;
  const pill = viewerPaymentStatus
    ? PAYMENT_PILL[viewerPaymentStatus]
    : { label: "You're signed up", tone: 'primary' as const };
  return (
    <div className="space-y-4">
      <div className="border-border-base bg-fg/5 rounded-shape-sm overflow-hidden border p-4">
        {paymentsOffPlatform ? (
          <>
            <h2 className="text-muted text-xs font-semibold tracking-wide uppercase">
              Pay in person
            </h2>
            <p className="text-fg mt-1 text-2xl font-bold">{formatUsd(ticketCents)}</p>
            <p className="text-muted text-xs">
              Cash, Venmo, etc. — settle up with the host at the event.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-muted text-xs font-semibold tracking-wide uppercase">Pay online</h2>
            <p className="text-fg mt-1 text-2xl font-bold">{formatUsd(total)}</p>
            {platformFeeCents > 0 || processingFeeCents > 0 ? (
              <p className="text-muted text-xs">
                {formatUsd(ticketCents)} to the host
                {platformFeeCents > 0 ? ` + ${formatUsd(platformFeeCents)} service fee` : ''}
                {processingFeeCents > 0 ? ` + ${formatUsd(processingFeeCents)} processing fee` : ''}
              </p>
            ) : (
              <p className="text-muted text-xs">Service fee absorbed by host</p>
            )}
          </>
        )}
      </div>

      {isAttending ? (
        <div className="flex flex-col items-end gap-2">
          <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
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
        paymentsOffPlatform ? (
          <form action={joinEvent.bind(null, eventId)} className="flex justify-end">
            <ConfirmSubmitButton
              label={`Sign up — pay the host ${formatUsd(ticketCents)}`}
              pendingLabel="Signing up…"
              confirmMessage={`Sign up for "${eventTitle}" and pay the host ${formatUsd(ticketCents)} in person (cash, Venmo, etc.)?`}
            />
          </form>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <form action={startTicketCheckout.bind(null, eventId)}>
              <ConfirmSubmitButton
                label={`Pay online — ${formatUsd(total)}`}
                pendingLabel="Redirecting…"
                confirmMessage={`Continue to Stripe to pay ${formatUsd(total)}?`}
              />
            </form>
            {platformFeeCents > 0 && (
              <p className="text-muted max-w-[18rem] text-right text-[10px]">
                Includes {formatUsd(platformFeeCents)} service fee.
              </p>
            )}
          </div>
        )
      ) : (
        <div className="space-y-4">
          {paymentsOffPlatform ? (
            <section className="border-border-base rounded-shape-sm border p-4">
              <h2 className="text-fg text-sm font-semibold">
                Sign up & pay the host {formatUsd(ticketCents)} in person
              </h2>
              <p className="text-muted mb-3 text-xs">
                No account needed — just your name. You&apos;ll settle up with the host at the event
                (cash, Venmo, etc.).
              </p>
              <GuestSignupForm eventId={eventId} />
            </section>
          ) : (
            <section className="border-border-base rounded-shape-sm border p-4">
              <h2 className="text-fg text-sm font-semibold">Pay online — {formatUsd(total)}</h2>
              <p className="text-muted mb-3 text-xs">
                {platformFeeCents > 0
                  ? `Includes ${formatUsd(platformFeeCents)} service fee. We need an email to send your receipt + cancellation link.`
                  : 'We need an email to send your receipt + cancellation link.'}
              </p>
              <form action={startGuestTicketCheckout.bind(null, eventId)} className="space-y-3">
                <GuestSignupFields emailRequired />
                <div className="flex justify-end">
                  <ConfirmSubmitButton
                    label={`Pay online — ${formatUsd(total)}`}
                    pendingLabel="Redirecting…"
                    confirmMessage={`Continue to Stripe to pay ${formatUsd(total)}?`}
                  />
                </div>
              </form>
            </section>
          )}

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
