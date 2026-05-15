'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getViewer } from '@/lib/server-auth';
import { getServerSupabase } from '@/lib/supabase';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { geocodeAddress } from '@/lib/geocode';
import { field, fieldOrUndefined } from '@/lib/form-data';
import { GetEventDetailQuery } from '@pickupvb/application';
import { handlers } from '@/lib/handlers';

export type EditEventState = {
    error?: string;
    fieldErrors?: Record<string, string>;
    ok?: boolean;
};

/**
 * Loads pricing-lock state — pricing fields are immutable once a paid
 * attendee exists for an event.
 */
export async function isPricingLocked(eventId: string): Promise<boolean> {
    const admin = getAdminSupabase();
    const { data, error } = await admin
        .from('event_attendees')
        .select('user_id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('payment_status', 'paid');
    if (error) return false;
    // PostgREST returns count via the response when head:true + count:'exact';
    // the supabase-js client surfaces it as `count` on the response object.
    // We re-query for safety since the typed shape doesn't include it.
    const { count } = await admin
        .from('event_attendees')
        .select('user_id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('payment_status', 'paid');
    void data;
    return (count ?? 0) > 0;
}

export async function editEventAction(
    _prev: EditEventState,
    formData: FormData,
): Promise<EditEventState> {
    const eventId = field(formData, 'eventId');
    if (!eventId) return { error: 'Missing event id.' };

    const viewer = await getViewer();
    if (!viewer) return { error: 'You must be signed in.' };
    if (viewer.isAnonymous) return { error: 'Finish claiming your account first.' };
    const { user } = viewer;

    // Authorize via the read model — `canManage` is computed using the same
    // host/co-host/group-admin rules as the detail page.
    let detail;
    try {
        detail = await handlers.getEventDetail.execute(
            new GetEventDetailQuery(eventId, user.id),
        );
    } catch {
        return { error: 'Event not found.' };
    }
    if (!detail.canManage) return { error: 'You do not have permission to edit this event.' };

    // ---- Collect basic fields ----
    const title = field(formData, 'title');
    const description = fieldOrUndefined(formData, 'description') ?? '';
    const rules = fieldOrUndefined(formData, 'rules') ?? '';
    const skillLevel = field(formData, 'skillLevel');
    const visibility = field(formData, 'visibility');
    const startsAt = field(formData, 'startsAt');
    const endsAt = field(formData, 'endsAt');

    if (!title || title.length < 3 || title.length > 120) {
        return { error: 'Title must be 3–120 characters.', fieldErrors: { title: 'Title must be 3–120 characters.' } };
    }
    const startsDate = new Date(startsAt);
    const endsDate = new Date(endsAt);
    if (Number.isNaN(startsDate.getTime()) || Number.isNaN(endsDate.getTime())) {
        return { error: 'Start and end times are required.' };
    }
    if (endsDate.getTime() <= startsDate.getTime()) {
        return { error: 'End time must be after start time.', fieldErrors: { endsAt: 'Must be after start.' } };
    }

    // ---- Capacity (open-play only; tournaments don't expose capacity here) ----
    const capacityKind = fieldOrUndefined(formData, 'capacityKind');
    const maxSpotsRaw = fieldOrUndefined(formData, 'maxSpots');
    const isOpenPlay = detail.type === 'open_play';
    const newCapacityKind = isOpenPlay
        ? (capacityKind === 'fixed' ? 'fixed' : 'unlimited')
        : null;
    const newMaxSpots = newCapacityKind === 'fixed' && maxSpotsRaw
        ? Math.max(1, Math.floor(Number(maxSpotsRaw)))
        : null;
    if (newCapacityKind === 'fixed' && (!newMaxSpots || !Number.isFinite(newMaxSpots))) {
        return { error: 'Max spots is required for fixed capacity.', fieldErrors: { maxSpots: 'Required.' } };
    }
    // Don't allow shrinking capacity below current attendee count.
    if (newCapacityKind === 'fixed' && newMaxSpots !== null) {
        const currentCount = detail.attendees.filter((a) => !a.waitlist).length;
        if (newMaxSpots < currentCount) {
            return {
                error: `Cannot set capacity below current attendee count (${currentCount}).`,
                fieldErrors: { maxSpots: `Must be ≥ ${currentCount}.` },
            };
        }
    }

    // ---- Location: re-geocode every save (cheap; keeps lat/lng accurate) ----
    const addressLine = field(formData, 'addressLine');
    const city = field(formData, 'city');
    const region = fieldOrUndefined(formData, 'region') ?? '';
    const postalCode = fieldOrUndefined(formData, 'postalCode') ?? '';
    const country = field(formData, 'country');
    let coords: { latitude: number; longitude: number };
    try {
        coords = await geocodeAddress({ addressLine, city, region, postalCode, country });
    } catch (err) {
        const m = err instanceof Error ? err.message : 'Could not geocode address.';
        return { error: m, fieldErrors: { addressLine: m } };
    }
    const wkt = `SRID=4326;POINT(${coords.longitude} ${coords.latitude})`;

    // ---- Pricing ----
    const priceUsdRaw = fieldOrUndefined(formData, 'priceUsd');
    const newPriceCents = priceUsdRaw ? Math.max(0, Math.round(Number(priceUsdRaw) * 100)) : 0;
    const refundWindowRaw = fieldOrUndefined(formData, 'refundWindowHours');
    const newRefundWindowHours = refundWindowRaw
        ? Math.max(0, Math.min(720, Math.round(Number(refundWindowRaw))))
        : 24;
    const newHostAbsorbsFee = field(formData, 'hostAbsorbsFee') === 'on';

    // Read current pricing to detect changes (and for the price-lock check).
    const admin = getAdminSupabase();
    const { data: cur } = await admin
        .from('events')
        .select('price_cents, host_absorbs_fee, refund_window_hours, host_id')
        .eq('id', eventId)
        .maybeSingle();
    type CurRow = {
        price_cents: number;
        host_absorbs_fee: boolean;
        refund_window_hours: number;
        host_id: string;
    };
    const c = cur as unknown as CurRow | null;
    const pricingChanged = !c
        ? false
        : (c.price_cents !== newPriceCents
            || c.host_absorbs_fee !== newHostAbsorbsFee
            || c.refund_window_hours !== newRefundWindowHours);

    if (pricingChanged) {
        const locked = await isPricingLocked(eventId);
        if (locked) {
            return {
                error:
                    'Pricing is locked once the first ticket has been sold. ' +
                    'Refund all attendees first to change pricing.',
            };
        }
        // If switching to paid, the host needs Stripe set up.
        if (newPriceCents > 0) {
            const { data: stripeRow } = await admin
                .from('host_stripe_accounts')
                .select('charges_enabled')
                .eq('user_id', c?.host_id ?? user.id)
                .maybeSingle();
            const enabled = (stripeRow as { charges_enabled: boolean } | null)?.charges_enabled;
            if (!enabled) {
                return {
                    error:
                        'You need to finish Stripe setup at /profile/billing before charging for events.',
                };
            }
        }
    }

    // ---- Apply update ----
    // We update via the user-session client so RLS still applies (host or
    // co-host can update; the read-model authorization above is the primary
    // gate). Pricing fields go through admin since they're sensitive.
    const supabase = await getServerSupabase();
    const { error: updErr } = await supabase
        .from('events')
        .update({
            title,
            description,
            rules,
            skill_level: skillLevel,
            visibility,
            starts_at: startsDate.toISOString(),
            ends_at: endsDate.toISOString(),
            address_line: addressLine,
            city,
            region,
            postal_code: postalCode,
            country,
            geo: wkt,
            ...(isOpenPlay
                ? { capacity_kind: newCapacityKind, max_spots: newMaxSpots }
                : {}),
            updated_at: new Date().toISOString(),
        } as never)
        .eq('id', eventId);
    if (updErr) return { error: `Update failed: ${updErr.message}` };

    if (pricingChanged) {
        const { error: priceErr } = await admin
            .from('events')
            .update({
                price_cents: newPriceCents,
                host_absorbs_fee: newHostAbsorbsFee,
                refund_window_hours: newRefundWindowHours,
            } as never)
            .eq('id', eventId);
        if (priceErr) return { error: `Pricing update failed: ${priceErr.message}` };
    }

    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/edit`);
    revalidatePath('/events');
    redirect(`/events/${eventId}`);
}
