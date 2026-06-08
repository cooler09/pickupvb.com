/**
 * Repository contract (DDD port) for the **individual** (non-team) event
 * payment sidecars that the Stripe webhook reconciles: attendee ticket
 * payments (`event_participant_payments` + the `event_participants` row it
 * gates), tips (`event_tips`), sponsor slots (`event_sponsors`), and the
 * `event_payment_audit` trail. Distinct from {@link EventTeamPaymentRepository}
 * (roster-team payments) and the `EventTeamRegistration` aggregate (ad-hoc /
 * walk-in team payments), which are mediated through their own aggregates.
 *
 * These rows carry **no domain invariants** — they are a flat reconciliation
 * of Stripe state (the same reason the host-payment state in
 * `payments/host-*.ts` is a port, not an aggregate). The adapter therefore
 * exposes plain CRUD-shaped operations rather than load/mutate/save of an
 * aggregate. It is consumed **only** from the session-less Stripe webhook
 * handlers (`apps/web/src/lib/webhooks/{checkout,charge}.ts`) on the
 * service-role admin client — there is no authenticated user and no RLS to
 * enforce (AGENTS.md pitfall #8 sanctions the admin client for webhook
 * contexts).
 */

/** A paid-up attendee row eligible for refund cleanup, resolved by PI. */
export interface RefundableAttendee {
  participantId: string;
  userId: string;
  amountPaidCents: number;
  eventId: string;
}

/** An `event_payment_audit` trail entry. */
export interface PaymentAuditEntry {
  eventId: string;
  userId: string;
  action: 'paid' | 'refunded';
  amountCents: number;
  paymentIntentId: string | null;
}

/** The a-la-carte badge-authoring unlock mirrored from a completed checkout. */
export interface PaidBadgeSlot {
  eventId: string;
  purchasedByUserId: string;
  checkoutSessionId: string;
  paymentIntentId: string | null;
  /** ISO-8601 timestamp; the caller owns the clock so the write stays pure. */
  paidAt: string;
}

/** The a-la-carte sponsor slot purchase mirrored from a completed checkout. */
export interface PaidSponsorSlot {
  eventId: string;
  name: string;
  blurb: string | null;
  linkUrl: string | null;
  logoUrl: string | null;
  discountCode: string | null;
  purchasedByUserId: string;
  checkoutSessionId: string;
  paymentIntentId: string | null;
  /** ISO-8601 timestamp; the caller owns the clock so the write stays pure. */
  paidAt: string;
}

export interface EventPaymentRepository {
  // --- checkout.session.completed --------------------------------------------
  /**
   * Flip the pending attendee payment row (matched by its
   * `checkout_session_id`) to `paid`. Throws on a DB error so the webhook
   * returns 5xx and Stripe retries.
   */
  markAttendeePaymentPaidByCheckoutSession(
    checkoutSessionId: string,
    paid: { paymentIntentId: string | null; amountCents: number; paidAt: string },
  ): Promise<void>;
  /** Append an audit-trail row. Best-effort — does not throw on DB error. */
  recordPaymentAudit(entry: PaymentAuditEntry): Promise<void>;
  /** Flip a tip row (by id) to `paid`. Throws on a DB error. */
  markTipPaid(
    tipId: string,
    paid: { paymentIntentId: string | null; paidAt: string },
  ): Promise<void>;
  /** Upsert the a-la-carte sponsor slot (one per event). Throws on a DB error. */
  upsertSponsorSlot(slot: PaidSponsorSlot): Promise<void>;
  /** Unlock à-la-carte badge authoring for an event (one per event). Throws on a DB error. */
  unlockBadgeSlot(slot: PaidBadgeSlot): Promise<void>;
  /** Resolve an event's payout host. Null if the event was deleted mid-flight. */
  findEventHostId(eventId: string): Promise<string | null>;

  // --- checkout.session.expired ----------------------------------------------
  /**
   * Drop the still-pending attendee reservation for an expired session so the
   * spot re-opens (deletes the `event_participants` row; the payment cascades).
   */
  deletePendingAttendeeByCheckoutSession(checkoutSessionId: string): Promise<void>;
  /** Delete a still-pending tip row (idempotent). */
  deletePendingTip(tipId: string): Promise<void>;

  // Note: `payment_intent.payment_failed` is handled as a no-op — releasing a
  // reservation while the Checkout Session is still retryable is unsafe (the
  // buyer may complete on that same session). Cleanup is owned by
  // `checkout.session.expired` + the cancel route. See `handlePaymentFailed`
  // and docs/audits/stripe-integration.md SI-1.

  // --- charge.refunded -------------------------------------------------------
  /** Mark any tip on this PI `refunded`. `refundedAt` is an ISO-8601 stamp. */
  markTipsRefundedByPaymentIntent(paymentIntentId: string, refundedAt: string): Promise<void>;
  /** Find the paid attendee charge on this PI, or null. */
  findRefundableAttendeeByPaymentIntent(
    paymentIntentId: string,
  ): Promise<RefundableAttendee | null>;
  /** Delete an attendee row by id (refund cleanup, re-opens capacity). */
  deleteAttendee(participantId: string): Promise<void>;
  /** Resolve an event's title for the refund notification. Null if deleted. */
  findEventTitle(eventId: string): Promise<string | null>;

  // --- charge.dispute.created ------------------------------------------------
  /**
   * Resolve `{ eventId, hostId }` for a tip charged on this PI, for routing a
   * chargeback notification to the host. Null when no tip matches (the charge
   * was an attendee ticket, a team payment, or unrelated). See
   * `handleChargeDisputed`.
   */
  findTipContextByPaymentIntent(
    paymentIntentId: string,
  ): Promise<{ eventId: string; hostId: string } | null>;
}
