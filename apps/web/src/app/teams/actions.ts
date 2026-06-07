'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseAdminClient } from '@pickupvb/supabase';
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '@pickupvb/domain';
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
  const { user, supabase } = await requireRealUser('/teams/new');

  const name = field(formData, 'name');

  const fieldErrors: Record<string, string> = {};
  if (name.length < 1 || name.length > 80) fieldErrors.name = 'Name is required (1–80 chars).';
  if (Object.keys(fieldErrors).length > 0)
    return { error: 'Please fix the highlighted fields.', fieldErrors };

  let id: string;
  try {
    const out = await handlers.createTeam.execute(new CreateTeamCommand(user.id, name));
    id = out.id;
  } catch (err) {
    if (err instanceof ValidationError) {
      return { error: err.message };
    }
    throw err;
  }

  // Look up the auto-assigned slug for the redirect.
  const { data: row } = await supabase.from('teams').select('slug').eq('id', id).maybeSingle();
  const slug = (row as { slug: string } | null)?.slug ?? id;

  revalidatePath('/teams');
  redirect(`/teams/${slug}`);
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

  // Look up the invitee's auto-accept + discoverability preferences. These
  // columns are owner-only (not exposed for filtering here) so we use the admin
  // client to read them.
  const admin = createSupabaseAdminClient();
  const { data: pref } = await admin
    .from('profiles')
    .select('auto_accept_team_invites, discoverable')
    .eq('id', userId)
    .maybeSingle();
  const prefRow = pref as {
    auto_accept_team_invites: boolean | null;
    discoverable: boolean | null;
  } | null;

  // Private players (`discoverable = false`) opted out of being added to other
  // people's teams. They're already hidden from the picker; this is the hard
  // guarantee against a direct/stale user id. Swallow like the typed-error
  // branches below — the page re-renders without the member added.
  if (prefRow?.discoverable === false) return;

  const autoAccept = Boolean(prefRow?.auto_accept_team_invites);

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
        supabase.from('teams').select('slug, name').eq('id', teamId).maybeSingle(),
        supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
      ]);
      const teamRowTyped = teamRow as { slug: string; name: string } | null;
      const teamName = teamRowTyped?.name ?? 'a team';
      const teamSlug = teamRowTyped?.slug ?? teamId;
      const inviterName =
        (inviterRow as { display_name: string | null } | null)?.display_name ?? 'A captain';
      await notify(
        'team.invite',
        userId,
        { teamSlug, groupName: teamName, inviterName },
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
export async function acceptInviteAction(teamId: string, returnPath: string): Promise<void> {
  const { user } = await requireSession(returnPath);
  try {
    await handlers.acceptTeamInvite.execute(new AcceptTeamInviteCommand(teamId, user.id));
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
export async function declineInviteAction(teamId: string, returnPath: string): Promise<void> {
  const { user } = await requireSession(returnPath);
  try {
    await handlers.removeTeamMember.execute(new RemoveTeamMemberCommand(teamId, user.id, user.id));
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
    await handlers.setTeamExtraMembers.execute(new SetTeamExtraMembersCommand(teamId, n, user.id));
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
    await handlers.removeTeamMember.execute(new RemoveTeamMemberCommand(teamId, userId, user.id));
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
