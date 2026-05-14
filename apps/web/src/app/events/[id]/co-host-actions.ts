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
