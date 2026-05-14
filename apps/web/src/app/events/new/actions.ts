'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { CreateEventSchema } from '@pickupvb/types';
import { CreateEventCommand } from '@pickupvb/application';
import { EventType } from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { field, fieldOrUndefined } from '@/lib/form-data';
import { getViewer } from '@/lib/server-auth';
import { geocodeAddress } from '@/lib/geocode';

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
                ? capacityKind === 'fixed' && maxSpotsRaw
                    ? { kind: 'fixed' as const, maxSpots: Number(maxSpotsRaw) }
                    : { kind: 'unlimited' as const }
                : undefined,
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

    revalidatePath('/events');
    redirect(`/events/${result.id}`);
}
