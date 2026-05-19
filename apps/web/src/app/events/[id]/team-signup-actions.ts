'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import {
    RegisterTeamCommand,
    WithdrawTeamCommand,
} from '@pickupvb/application';
import {
    ConflictError,
    InvariantViolation,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
} from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { field } from '@/lib/form-data';
import { requireRealUser, requireSession } from '@/lib/server-auth';

/**
 * Bound at the call site:
 *   registerTeamFromForm.bind(null, eventId, returnPath)
 *
 * Reads `team_id` from the form. Returns the user back to the event page
 * with a result query param the panel inspects on next render.
 */
export async function registerTeamFromForm(
    eventId: string,
    returnPath: string,
    formData: FormData,
): Promise<void> {
    const teamId = field(formData, 'team_id');
    if (!teamId) redirect(`${returnPath}?team=missing` as Route);

    const { user } = await requireRealUser(returnPath);

    try {
        await handlers.registerTeam.execute(
            new RegisterTeamCommand(eventId, teamId, user.id),
        );
    } catch (err) {
        if (err instanceof ConflictError) {
            redirect(`${returnPath}?team=already` as Route);
        }
        if (err instanceof UnauthorizedError) {
            redirect(`${returnPath}?team=forbidden` as Route);
        }
        if (err instanceof InvariantViolation) {
            redirect(`${returnPath}?team=closed` as Route);
        }
        if (err instanceof NotFoundError) {
            redirect(`${returnPath}?team=missing` as Route);
        }
        if (err instanceof ValidationError) {
            redirect(`${returnPath}?team=invalid` as Route);
        }
        console.error('[registerTeamFromForm] uncaught error', {
            eventId,
            teamId,
            userId: user.id,
            name: (err as Error)?.name,
            message: (err as Error)?.message,
            stack: (err as Error)?.stack,
        });
        throw err;
    }
    revalidatePath(returnPath);
    redirect(`${returnPath}?team=registered` as Route);
}

export async function withdrawTeamFromForm(
    eventId: string,
    teamId: string,
    returnPath: string,
): Promise<void> {
    const { user } = await requireSession(returnPath);
    try {
        await handlers.withdrawTeam.execute(
            new WithdrawTeamCommand(eventId, teamId, user.id),
        );
    } catch (err) {
        if (err instanceof UnauthorizedError) {
            redirect(`${returnPath}?team=forbidden` as Route);
        }
        if (err instanceof NotFoundError) {
            redirect(`${returnPath}?team=missing` as Route);
        }
        throw err;
    }
    revalidatePath(returnPath);
    redirect(`${returnPath}?team=withdrawn` as Route);
}
