'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
    ConflictError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
} from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { field } from '@/lib/form-data';
import { requireRealUser, requireSession } from '@/lib/server-auth';
import {
    AddTeamMemberCommand,
    CreateTeamCommand,
    RemoveTeamMemberCommand,
} from '@pickupvb/application';

export type TeamFormState = {
    error?: string;
    fieldErrors?: Record<string, string>;
};

export async function createTeamAction(
    _prev: TeamFormState,
    formData: FormData,
): Promise<TeamFormState> {
    const { user } = await requireRealUser('/teams/new');

    const name = field(formData, 'name');
    const format = field(formData, 'format');

    const fieldErrors: Record<string, string> = {};
    if (name.length < 1 || name.length > 80)
        fieldErrors.name = 'Name is required (1–80 chars).';
    if (!['sixes', 'quads', 'triples', 'doubles'].includes(format))
        fieldErrors.format = 'Pick a format.';
    if (Object.keys(fieldErrors).length > 0)
        return { error: 'Please fix the highlighted fields.', fieldErrors };

    let id: string;
    try {
        const out = await handlers.createTeam.execute(
            new CreateTeamCommand(user.id, name, format),
        );
        id = out.id;
    } catch (err) {
        if (err instanceof ValidationError) {
            return { error: err.message };
        }
        throw err;
    }

    revalidatePath('/teams');
    redirect(`/teams/${id}`);
}

/**
 * Bound at the call site: `addMemberFromForm.bind(null, teamId, returnPath)`.
 * Captain-only; the handler enforces that.
 */
export async function addMemberFromForm(
    teamId: string,
    returnPath: string,
    formData: FormData,
): Promise<void> {
    const userId = field(formData, 'user_id');
    if (!userId) return;
    const { user } = await requireSession(returnPath);
    try {
        await handlers.addTeamMember.execute(
            new AddTeamMemberCommand(teamId, userId, user.id),
        );
    } catch (err) {
        if (
            err instanceof UnauthorizedError ||
            err instanceof NotFoundError ||
            err instanceof ConflictError ||
            err instanceof ValidationError
        ) {
            // Swallow: the page re-renders without the member added.
            // (UI shows a generic toast in a future pass.)
            return;
        }
        throw err;
    }
    revalidatePath(returnPath);
}

export async function removeMemberFromForm(
    teamId: string,
    userId: string,
    returnPath: string,
): Promise<void> {
    const { user } = await requireSession(returnPath);
    try {
        await handlers.removeTeamMember.execute(
            new RemoveTeamMemberCommand(teamId, userId, user.id),
        );
    } catch (err) {
        if (
            err instanceof UnauthorizedError ||
            err instanceof NotFoundError ||
            err instanceof ValidationError
        ) {
            return;
        }
        throw err;
    }
    revalidatePath(returnPath);
}
