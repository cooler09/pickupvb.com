'use server';

import { revalidatePath } from 'next/cache';
import { AddEventCoHostCommand, RemoveEventCoHostCommand } from '@pickupvb/application';
import { handlers } from '@/lib/handlers';
import { requireSession } from '@/lib/server-auth';

export async function addEventCoHost(
    eventId: string,
    party: { userId?: string; groupId?: string },
    returnPath?: string,
): Promise<void> {
    if (!eventId || (!party.userId && !party.groupId)) return;
    const { user } = await requireSession();
    await handlers.addEventCoHost.execute(
        new AddEventCoHostCommand(eventId, party, user.id),
    );
    if (returnPath) revalidatePath(returnPath);
}

export async function removeEventCoHost(
    eventId: string,
    party: { userId?: string; groupId?: string },
    returnPath?: string,
): Promise<void> {
    if (!eventId) return;
    const { user } = await requireSession();
    await handlers.removeEventCoHost.execute(
        new RemoveEventCoHostCommand(eventId, party, user.id),
    );
    if (returnPath) revalidatePath(returnPath);
}

/**
 * Form-bound wrapper used by the "Add co-host" disclosure on the event
 * detail page. Reads `kind` ("group" | "user") + the corresponding id field
 * out of the FormData, then delegates to `addEventCoHost`.
 */
export async function addCoHostFromForm(
    eventId: string,
    returnPath: string,
    formData: FormData,
): Promise<void> {
    const kind = String(formData.get('kind') ?? '');
    if (kind === 'group') {
        const groupId = String(formData.get('group_id') ?? '').trim();
        if (groupId) await addEventCoHost(eventId, { groupId }, returnPath);
    } else if (kind === 'user') {
        const userId = String(formData.get('user_id') ?? '').trim();
        if (userId) await addEventCoHost(eventId, { userId }, returnPath);
    }
}
