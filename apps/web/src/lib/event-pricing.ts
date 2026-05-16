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

export async function getEventPricing(
    eventId: string,
): Promise<EventPricing | null> {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase
        .from('events')
        .select('host_id, price_cents, host_absorbs_fee, refund_window_hours')
        .eq('id', eventId)
        .maybeSingle();
    if (error || !data) return null;
    type Row = {
        host_id: string;
        price_cents: number;
        host_absorbs_fee: boolean;
        refund_window_hours: number;
    };
    const r = data as unknown as Row;
    return {
        hostId: r.host_id,
        priceCents: r.price_cents ?? 0,
        hostAbsorbsFee: r.host_absorbs_fee ?? false,
        refundWindowHours: r.refund_window_hours ?? 24,
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
import { isPro, PRO_PLATFORM_FEE_BPS } from './pro';

/** Same as `platformFeeCents` but Pro hosts get 2.5% instead of 5%. */
async function platformFeeCentsFor(
    hostId: string,
    amountCents: number,
): Promise<number> {
    if (await isPro(hostId)) {
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

export function attendeeChargeBreakdown(p: EventPricing): {
    ticketCents: number;
    platformFeeCents: number;
    totalCents: number;
} {
    const fee = platformFeeCents(p.priceCents);
    if (p.hostAbsorbsFee) {
        // Host eats the fee; attendee just pays ticket price.
        return { ticketCents: p.priceCents, platformFeeCents: 0, totalCents: p.priceCents };
    }
    return {
        ticketCents: p.priceCents,
        platformFeeCents: fee,
        totalCents: p.priceCents + fee,
    };
}
