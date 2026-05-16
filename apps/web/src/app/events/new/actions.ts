'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { CreateEventSchema } from '@pickupvb/types';
import { CreateEventCommand, JoinEventCommand, JoinEventWithPositionCommand } from '@pickupvb/application';
import { EVENT_POSITIONS, EventType } from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { field, fieldOrUndefined } from '@/lib/form-data';
import { getViewer } from '@/lib/server-auth';
import { geocodeAddress } from '@/lib/geocode';
import { parsePriceCents, parseRefundWindowHours } from '@/lib/money';
import { validateHostPaidEventCap } from '@/lib/host-paid-event-cap';
import { requireHostChargesEnabled } from '@/lib/host-stripe-account';

export type CreateEventState = {
    error?: string;
    fieldErrors?: Record<string, string>;
};

export async function createEventAction(
    _prev: CreateEventState,
    formData: FormData,
): Promise<CreateEventState> {
    const viewer = await getViewer();
    if (!viewer) return { error: 'You must be signed in to host an event.' };
    if (viewer.isAnonymous)
        return { error: 'Finish claiming your account before hosting an event.' };
    const { supabase, user } = viewer;

    const type = field(formData, 'type');
    const capacityKind = field(formData, 'capacityKind') || 'unlimited';
    const maxSpotsRaw = fieldOrUndefined(formData, 'maxSpots');
    const byPosition = field(formData, 'byPosition') === 'on';
    const positionRoster: Record<string, number> = {};
    if (byPosition) {
        for (const pos of EVENT_POSITIONS) {
            const raw = fieldOrUndefined(formData, `position_${pos}`);
            const n = raw ? Math.max(0, Math.floor(Number(raw))) : 0;
            if (Number.isFinite(n) && n > 0) positionRoster[pos] = n;
        }
    }

    const addressLine = field(formData, 'addressLine');
    const city = field(formData, 'city');
    const region = field(formData, 'region');
    const postalCode = field(formData, 'postalCode');
    const country = field(formData, 'country');

    let coords: { latitude: number; longitude: number };
    try {
        coords = await geocodeAddress({ addressLine, city, region, postalCode, country });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not geocode address.';
        return { error: message, fieldErrors: { 'location.addressLine': message } };
    }

    const raw = {
        title: field(formData, 'title'),
        description: field(formData, 'description'),
        rules: field(formData, 'rules'),
        surface: field(formData, 'surface'),
        format: fieldOrUndefined(formData, 'format'),
        gender: fieldOrUndefined(formData, 'gender'),
        skillLevel: field(formData, 'skillLevel'),
        type,
        visibility: field(formData, 'visibility'),
        location: {
            addressLine,
            city,
            region,
            postalCode,
            country,
            latitude: coords.latitude,
            longitude: coords.longitude,
        },
        startsAt: field(formData, 'startsAt'),
        endsAt: field(formData, 'endsAt'),
        capacity:
            type === EventType.OpenPlay
                ? byPosition
                    ? { kind: 'unlimited' as const }
                    : capacityKind === 'fixed' && maxSpotsRaw
                        ? { kind: 'fixed' as const, maxSpots: Number(maxSpotsRaw) }
                        : { kind: 'unlimited' as const }
                : undefined,
        ...(byPosition && Object.keys(positionRoster).length > 0
            ? { positionRoster }
            : {}),
    };

    let dto;
    try {
        dto = CreateEventSchema.parse(raw);
    } catch (err) {
        if (err instanceof ZodError) {
            const fieldErrors: Record<string, string> = {};
            for (const issue of err.issues) {
                const path = issue.path.join('.');
                if (!fieldErrors[path]) fieldErrors[path] = issue.message;
            }
            return { error: 'Please fix the highlighted fields.', fieldErrors };
        }
        return { error: 'Could not parse form input.' };
    }

    let result: { id: string };
    try {
        result = await handlers.createEvent.execute(new CreateEventCommand(user.id, dto));
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create event.';
        return { error: message };
    }

    // If the user chose to host on behalf of a group, attach it to the row.
    // RLS on events_update enforces they're owner/admin of that group.
    const hostGroupId = fieldOrUndefined(formData, 'hostGroupId');
    if (hostGroupId) {
        const { error: groupErr } = await supabase
            .from('events')
            .update({ host_group_id: hostGroupId } as never)
            .eq('id', result.id);
        if (groupErr) {
            return { error: `Event created, but couldn't set group host: ${groupErr.message}` };
        }
    }

    // Pricing: if the host set a non-zero price, gate it behind a connected
    // Stripe account that's actually able to receive charges. Free events
    // (price = 0) skip Stripe entirely.
    const priceCents = parsePriceCents(fieldOrUndefined(formData, 'priceUsd'));
    if (priceCents > 0) {
        // Free hosts are capped at 1 paid event per 30 days. Pro hosts have
        // no cap. Check BEFORE creating Stripe Checkout, so we can roll back
        // the event row cleanly. Count already includes the row we just
        // inserted.
        const cap = await validateHostPaidEventCap(user.id, { includesCurrentEvent: true });
        if (!cap.ok) {
            await supabase.from('events').delete().eq('id', result.id);
            return { error: cap.reason };
        }
        const stripe = await requireHostChargesEnabled(user.id);
        if (!stripe.ok) {
            // Roll back the event so the host doesn't end up with a free
            // event they thought was paid.
            await supabase.from('events').delete().eq('id', result.id);
            return { error: stripe.reason };
        }
        const refundWindowHours = parseRefundWindowHours(
            fieldOrUndefined(formData, 'refundWindowHours'),
        );
        const hostAbsorbsFee = field(formData, 'hostAbsorbsFee') === 'on';
        const { error: priceErr } = await supabase
            .from('events')
            .update({
                price_cents: priceCents,
                host_absorbs_fee: hostAbsorbsFee,
                refund_window_hours: refundWindowHours,
            } as never)
            .eq('id', result.id);
        if (priceErr) {
            return { error: `Event created, but pricing failed: ${priceErr.message}` };
        }
    }

    // Auto-add the host to the attendee list when they opted in (open-play
    // only — tournaments use team signup). Best-effort: a failure here
    // shouldn't block the redirect to the event the host just created;
    // they can always click Join from the detail page. Skipped for paid
    // events (host shouldn't have to buy a ticket to their own event).
    if (
        priceCents === 0 &&
        dto.type === EventType.OpenPlay &&
        field(formData, 'joinAsHost') === 'on'
    ) {
        try {
            if (byPosition && Object.keys(positionRoster).length > 0) {
                // Pick the first configured position with the smallest count
                // > 0; the host can swap from the event page.
                const firstPos = EVENT_POSITIONS.find((p) => (positionRoster[p] ?? 0) > 0);
                if (firstPos) {
                    await handlers.joinEventWithPosition.execute(
                        new JoinEventWithPositionCommand(result.id, user.id, firstPos),
                    );
                }
            } else {
                await handlers.joinEvent.execute(new JoinEventCommand(result.id, user.id));
            }
        } catch {
            // Swallow — the event exists; auto-join is a convenience.
        }
    }

    revalidatePath('/events');
    redirect(`/events/${result.id}?created=1`);
}
