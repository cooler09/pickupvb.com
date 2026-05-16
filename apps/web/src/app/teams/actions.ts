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
import { notify } from '@/lib/notify';
import {
    AcceptTeamInviteCommand,
    AddTeamMemberCommand,
    CreateTeamCommand,
    RemoveTeamMemberCommand,
    SetTeamExtraMembersCommand,
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
 *
 * The new member is added as `pending` unless they've opted into auto-accept
 * on their profile (`profiles.auto_accept_team_invites`).
 */
export async function addMemberFromForm(
    teamId: string,
    returnPath: string,
    formData: FormData,
): Promise<void> {
    const userId = field(formData, 'user_id');
    if (!userId) return;
    const { supabase, user } = await requireSession(returnPath);

    // Look up the invitee's auto-accept preference. Default to false (the
    // safer behavior) if the column or row is missing.
    const { data: pref } = await supabase
        .from('profiles')
        .select('auto_accept_team_invites')
        .eq('id', userId)
        .maybeSingle();
    const autoAccept = Boolean(
        (pref as { auto_accept_team_invites: boolean | null } | null)
            ?.auto_accept_team_invites,
    );

    try {
        await handlers.addTeamMember.execute(
            new AddTeamMemberCommand(teamId, userId, user.id, autoAccept),
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

    // Notify the invitee unless they auto-accepted (then it's not really an
    // invite). Best-effort; failures don't block.
    if (!autoAccept) {
        try {
            const [{ data: teamRow }, { data: inviterRow }] = await Promise.all([
                supabase.from('teams').select('name').eq('id', teamId).maybeSingle(),
                supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
            ]);
            const teamName = (teamRow as { name: string } | null)?.name ?? 'a team';
            const inviterName =
                (inviterRow as { display_name: string | null } | null)?.display_name ??
                'A captain';
            await notify(
                'team.invite',
                userId,
                { groupId: teamId, groupName: teamName, inviterName },
                { idempotencyKey: `${teamId}:${userId}` },
            );
        } catch {
            // best-effort
        }
    }

    revalidatePath(returnPath);
}

/**
 * Invitee accepts a pending team invite. Bound at the call site:
 * `acceptInviteAction.bind(null, teamId, returnPath)`.
 */
export async function acceptInviteAction(
    teamId: string,
    returnPath: string,
): Promise<void> {
    const { user } = await requireSession(returnPath);
    try {
        await handlers.acceptTeamInvite.execute(
            new AcceptTeamInviteCommand(teamId, user.id),
        );
    } catch (err) {
        if (
            err instanceof NotFoundError ||
            err instanceof ValidationError ||
            err instanceof UnauthorizedError
        ) {
            return;
        }
        throw err;
    }
    revalidatePath(returnPath);
}

/**
 * Invitee declines a pending team invite (or any member leaves the team).
 * Implementation-wise this is just removeMember-as-self, so it shares the
 * existing handler.
 */
export async function declineInviteAction(
    teamId: string,
    returnPath: string,
): Promise<void> {
    const { user } = await requireSession(returnPath);
    try {
        await handlers.removeTeamMember.execute(
            new RemoveTeamMemberCommand(teamId, user.id, user.id),
        );
    } catch (err) {
        if (
            err instanceof NotFoundError ||
            err instanceof ValidationError ||
            err instanceof UnauthorizedError
        ) {
            return;
        }
        throw err;
    }
    revalidatePath(returnPath);
}

/**
 * Captain sets the count of off-site players (people on the team but not on
 * the site). Bound at the call site:
 *   `setExtraMembersFromForm.bind(null, teamId, returnPath)`.
 */
export async function setExtraMembersFromForm(
    teamId: string,
    returnPath: string,
    formData: FormData,
): Promise<void> {
    const raw = String(formData.get('extra_member_count') ?? '').trim();
    const n = Number.parseInt(raw, 10);
    if (!Number.isInteger(n) || n < 0) return;
    const { user } = await requireSession(returnPath);
    try {
        await handlers.setTeamExtraMembers.execute(
            new SetTeamExtraMembersCommand(teamId, n, user.id),
        );
    } catch (err) {
        if (
            err instanceof NotFoundError ||
            err instanceof UnauthorizedError ||
            err instanceof ValidationError
        ) {
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
