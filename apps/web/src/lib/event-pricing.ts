/**
 * Reads pricing config off an event row. Kept out of the domain aggregate
 * because pricing is a payments concern, not a volleyball-rules concern —
 * the aggregate doesn't need a `price` invariant.
 *
 * Returned shape uses camelCase. `price_cents = 0` means the event is free
 * and Stripe is not involved at all.
 */
import { getServerSupabase } from './supabase';

export type EventPricing = {
  priceCents: number;
  hostAbsorbsFee: boolean;
  passProcessingFeeToBuyer: boolean;
  refundWindowHours: number;
  hostId: string;
  // Step 5a: child rows (`event_attendees`) are keyed by division_id only.
  // The per-player checkout flow targets the primary (sort_order = 0)
  // division; this is its id.
  divisionId: string;
};

export async function getEventPricing(eventId: string): Promise<EventPricing | null> {
  const supabase = await getServerSupabase();
  // Pricing now lives on `event_divisions` (ADR 0006 Phase 9a). We use the
  // first division (sort_order asc) as the canonical event price for the
  // per-player individual-signup checkout flow. Per-team divisions have
  // their own checkout path (see `team-checkout-actions.ts`) that loads
  // the specific division's `price_cents` directly — this helper is not
  // on that path. Multi-division per-player checkout (each division
  // priced differently for individual attendees) is still future scope;
  // today the create/edit boundary enforces that team-led tournaments
  // with multiple divisions either all use `per_team` pricing or set
  // `payments_off_platform` (ADR 0007 §3).
  const [eventRes, divRes] = await Promise.all([
    supabase
      .from('events')
      .select('host_id, host_absorbs_fee, pass_processing_fee_to_buyer, refund_window_hours')
      .eq('id', eventId)
      .maybeSingle(),
    supabase
      .from('event_divisions')
      .select('id, price_cents')
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  if (eventRes.error || !eventRes.data) return null;
  type EventRow = {
    host_id: string;
    host_absorbs_fee: boolean;
    pass_processing_fee_to_buyer: boolean;
    refund_window_hours: number;
  };
  type DivRow = { id: string; price_cents: number | null };
  const e = eventRes.data as unknown as EventRow;
  const d = (divRes.data as unknown as DivRow | null) ?? null;
  if (!d) return null;
  return {
    hostId: e.host_id,
    priceCents: d.price_cents ?? 0,
    divisionId: d.id,
    hostAbsorbsFee: e.host_absorbs_fee ?? false,
    passProcessingFeeToBuyer: e.pass_processing_fee_to_buyer ?? false,
    refundWindowHours: e.refund_window_hours ?? 24,
  };
}

export function isPaidEvent(p: EventPricing | null): boolean {
  return !!p && p.priceCents > 0;
}

/**
 * What the attendee actually pays. If the host absorbs the platform fee,
 * the attendee just pays `priceCents`. Otherwise the platform fee is added
 * as a separate line item.
 *
 * Stripe's processing fee (~2.9% + 30¢) is opt-in pass-through per
 * `events.pass_processing_fee_to_buyer` — when set, the buyer sees it as
 * a third "Processing fee" line; when not, it comes out of the host's
 * payout the way every Stripe charge does by default. Either way Stripe
 * does NOT return the processing fee on a refund (Stripe policy since
 * 2019), so a refunded ticket nets the host the processing fee out of
 * pocket regardless of who originally bore it on the front end.
 */
import { platformFeeCents, processingFeeCents } from './stripe';
import { PRO_PLATFORM_FEE_BPS } from './pro';
import { hasProBenefits } from './admin';

/** Same as `platformFeeCents` but Pro hosts (and admins) get 2.5% instead of 5%. */
export async function platformFeeCentsFor(hostId: string, amountCents: number): Promise<number> {
  if (await hasProBenefits(hostId)) {
    return Math.round((amountCents * PRO_PLATFORM_FEE_BPS) / 10_000);
  }
  return platformFeeCents(amountCents);
}

/**
 * Stripe processing fee that should be added to the buyer's bill as a
 * separate line item, given the event's pass-through choice and the
 * fee-absorption mode.
 *
 * Returns 0 when:
 *   * the host is absorbing the platform fee (host advertised "what you
 *     see is what you pay" — adding a processing-fee line would
 *     contradict that promise), OR
 *   * pass-through is disabled on the event (legacy default).
 *
 * Otherwise: `ceil(0.029 * (ticket + platformFee)) + 30`. The host's
 * payout is restored to the advertised ticket + platform fee, less
 * Stripe's actual fee on the new (slightly higher) gross — a sub-cent
 * gap matches what other ticketing platforms accept.
 */
export function buyerProcessingFeeCents(opts: {
  passToBuyer: boolean;
  hostAbsorbs: boolean;
  subtotalCents: number;
}): number {
  if (opts.hostAbsorbs || !opts.passToBuyer) return 0;
  return processingFeeCents(opts.subtotalCents);
}

export async function attendeeChargeBreakdownAsync(p: EventPricing): Promise<{
  ticketCents: number;
  platformFeeCents: number;
  processingFeeCents: number;
  totalCents: number;
}> {
  const fee = await platformFeeCentsFor(p.hostId, p.priceCents);
  if (p.hostAbsorbsFee) {
    return {
      ticketCents: p.priceCents,
      platformFeeCents: 0,
      processingFeeCents: 0,
      totalCents: p.priceCents,
    };
  }
  const subtotal = p.priceCents + fee;
  const processing = buyerProcessingFeeCents({
    passToBuyer: p.passProcessingFeeToBuyer,
    hostAbsorbs: p.hostAbsorbsFee,
    subtotalCents: subtotal,
  });
  return {
    ticketCents: p.priceCents,
    platformFeeCents: fee,
    processingFeeCents: processing,
    totalCents: subtotal + processing,
  };
}
