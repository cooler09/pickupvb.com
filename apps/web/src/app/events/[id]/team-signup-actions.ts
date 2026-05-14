'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
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
    if (!teamId) redirect(`${returnPath}?team=missing`);

    const { user } = await requireRealUser(returnPath);

    try {
        await handlers.registerTeam.execute(
            new RegisterTeamCommand(eventId, teamId, user.id),
        );
    } catch (err) {
        if (err instanceof ConflictError) {
            redirect(`${returnPath}?team=already`);
        }
        if (err instanceof UnauthorizedError) {
            redirect(`${returnPath}?team=forbidden`);
        }
        if (err instanceof InvariantViolation) {
            redirect(`${returnPath}?team=closed`);
        }
        if (err instanceof NotFoundError) {
            redirect(`${returnPath}?team=missing`);
        }
        if (err instanceof ValidationError) {
            redirect(`${returnPath}?team=invalid`);
        }
        throw err;
    }
    revalidatePath(returnPath);
    redirect(`${returnPath}?team=registered`);
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
            redirect(`${returnPath}?team=forbidden`);
        }
        if (err instanceof NotFoundError) {
            redirect(`${returnPath}?team=missing`);
        }
        throw err;
    }
    revalidatePath(returnPath);
    redirect(`${returnPath}?team=withdrawn`);
}
