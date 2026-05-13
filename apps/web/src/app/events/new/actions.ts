'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { CreateEventSchema } from '@pickupvb/types';
import { CreateEventCommand } from '@pickupvb/application';
import { EventType } from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { getServerSupabase } from '@/lib/supabase';

export type CreateEventState = {
    error?: string;
    fieldErrors?: Record<string, string>;
};

function emptyToUndefined(v: FormDataEntryValue | null): string | undefined {
    if (v === null) return undefined;
    const s = String(v).trim();
    return s.length === 0 ? undefined : s;
}

export async function createEventAction(
    _prev: CreateEventState,
    formData: FormData,
): Promise<CreateEventState> {
    const supabase = getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: 'You must be signed in to host an event.' };

    const type = String(formData.get('type') ?? '');
    const capacityKind = String(formData.get('capacityKind') ?? 'unlimited');
    const maxSpotsRaw = emptyToUndefined(formData.get('maxSpots'));

    const raw = {
        title: emptyToUndefined(formData.get('title')) ?? '',
        description: emptyToUndefined(formData.get('description')) ?? '',
        rules: emptyToUndefined(formData.get('rules')) ?? '',
        surface: String(formData.get('surface') ?? ''),
        format: String(formData.get('format') ?? ''),
        gender: String(formData.get('gender') ?? ''),
        skillLevel: String(formData.get('skillLevel') ?? ''),
        type,
        visibility: String(formData.get('visibility') ?? ''),
        location: {
            addressLine: emptyToUndefined(formData.get('addressLine')) ?? '',
            city: emptyToUndefined(formData.get('city')) ?? '',
            region: emptyToUndefined(formData.get('region')) ?? '',
            postalCode: emptyToUndefined(formData.get('postalCode')) ?? '',
            country: emptyToUndefined(formData.get('country')) ?? '',
            latitude: Number(formData.get('latitude')),
            longitude: Number(formData.get('longitude')),
        },
        startsAt: emptyToUndefined(formData.get('startsAt')) ?? '',
        endsAt: emptyToUndefined(formData.get('endsAt')) ?? '',
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

    revalidatePath('/events');
    redirect(`/events/${result.id}`);
}
