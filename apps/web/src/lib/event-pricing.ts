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
  refundWindowHours: number;
  hostId: string;
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
      .select('host_id, host_absorbs_fee, refund_window_hours')
      .eq('id', eventId)
      .maybeSingle(),
    supabase
      .from('event_divisions')
      .select('price_cents')
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  if (eventRes.error || !eventRes.data) return null;
  type EventRow = {
    host_id: string;
    host_absorbs_fee: boolean;
    refund_window_hours: number;
  };
  type DivRow = { price_cents: number | null };
  const e = eventRes.data as unknown as EventRow;
  const d = (divRes.data as unknown as DivRow | null) ?? null;
  return {
    hostId: e.host_id,
    priceCents: d?.price_cents ?? 0,
    hostAbsorbsFee: e.host_absorbs_fee ?? false,
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
 * Stripe's processing fee (~2.9% + 30¢) always comes out of the host's
 * payout — Stripe charges it on the connected account, regardless of who
 * ultimately bore the cost. Documented to hosts in the billing UI.
 */
import { platformFeeCents } from './stripe';
import { PRO_PLATFORM_FEE_BPS } from './pro';
import { hasProBenefits } from './admin';

/** Same as `platformFeeCents` but Pro hosts (and admins) get 2.5% instead of 5%. */
export async function platformFeeCentsFor(hostId: string, amountCents: number): Promise<number> {
  if (await hasProBenefits(hostId)) {
    return Math.round((amountCents * PRO_PLATFORM_FEE_BPS) / 10_000);
  }
  return platformFeeCents(amountCents);
}

export async function attendeeChargeBreakdownAsync(p: EventPricing): Promise<{
  ticketCents: number;
  platformFeeCents: number;
  totalCents: number;
}> {
  const fee = await platformFeeCentsFor(p.hostId, p.priceCents);
  if (p.hostAbsorbsFee) {
    return { ticketCents: p.priceCents, platformFeeCents: 0, totalCents: p.priceCents };
  }
  return {
    ticketCents: p.priceCents,
    platformFeeCents: fee,
    totalCents: p.priceCents + fee,
  };
}
