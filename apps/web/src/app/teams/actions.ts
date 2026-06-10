'use server';

import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseAdminClient } from '@pickupvb/supabase';
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
import { notify } from '@/lib/notify';
import {
  AcceptTeamInviteCommand,
  AddTeamMemberCommand,
  CreateTeamCommand,
  RemoveTeamMemberCommand,
  RenameTeamCommand,
  SetTeamExtraMembersCommand,
} from '@pickupvb/application';

/**
 * Typed-error → flash-reason mapping shared by the captain roster mutations.
 * These actions run from plain `<form action>` submissions (no client state),
 * so per AGENTS.md they signal outcome via a redirect flash param the team
 * page reads and renders as an `<Alert>` — rather than swallowing the error.
 */
function isKnownTeamError(err: unknown): boolean {
  return (
    err instanceof UnauthorizedError ||
    err instanceof NotFoundError ||
    err instanceof ConflictError ||
    err instanceof ValidationError ||
    err instanceof InvariantViolation
  );
}

/**
 * Redirect back to the team page with a `?<query>` flash. `returnPath` is a
 * known team route (`/teams/${slug}`) but arrives as an opaque string, so
 * typedRoutes can't verify it — cast at this single seam.
 */
function flashRedirect(returnPath: string, query: string): never {
  redirect(`${returnPath}?${query}` as Route);
}

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
  // guarantee against a direct/stale user id.
  if (prefRow?.discoverable === false) flashRedirect(returnPath, 'roster=private');

  const autoAccept = Boolean(prefRow?.auto_accept_team_invites);

  // `added` = joined immediately (auto-accept); `invited` = pending invite sent.
  let outcome: 'added' | 'invited' | 'cap' | 'error' = autoAccept ? 'added' : 'invited';
  try {
    await handlers.addTeamMember.execute(
      new AddTeamMemberCommand(teamId, userId, user.id, autoAccept),
    );
  } catch (err) {
    // The aggregate raises InvariantViolation for both a full roster and a
    // duplicate; surface the full-roster case specifically (the picker already
    // excludes existing members, so a duplicate here is a rare race).
    if (err instanceof InvariantViolation && /full/i.test(err.message)) outcome = 'cap';
    else if (isKnownTeamError(err)) outcome = 'error';
    else throw err;
  }

  // Notify the invitee on a real pending invite (auto-accept isn't an invite).
  // Best-effort; failures don't block.
  if (outcome === 'invited') {
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
  flashRedirect(returnPath, `roster=${outcome}`);
}

/**
 * Invitee accepts a pending team invite. Bound at the call site:
 * `acceptInviteAction.bind(null, teamId, returnPath)`.
 */
export async function acceptInviteAction(teamId: string, returnPath: string): Promise<void> {
  const { user } = await requireSession(returnPath);
  let outcome: 'accepted' | 'error' = 'accepted';
  try {
    await handlers.acceptTeamInvite.execute(new AcceptTeamInviteCommand(teamId, user.id));
  } catch (err) {
    if (isKnownTeamError(err)) outcome = 'error';
    else throw err;
  }
  revalidatePath(returnPath);
  flashRedirect(returnPath, `invite=${outcome}`);
}

/**
 * Invitee declines a pending team invite (or any member leaves the team).
 * Implementation-wise this is just removeMember-as-self, so it shares the
 * existing handler.
 */
export async function declineInviteAction(teamId: string, returnPath: string): Promise<void> {
  const { user } = await requireSession(returnPath);
  let outcome: 'declined' | 'error' = 'declined';
  try {
    await handlers.removeTeamMember.execute(new RemoveTeamMemberCommand(teamId, user.id, user.id));
  } catch (err) {
    if (isKnownTeamError(err)) outcome = 'error';
    else throw err;
  }
  revalidatePath(returnPath);
  flashRedirect(returnPath, `invite=${outcome}`);
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
  if (!Number.isInteger(n) || n < 0) flashRedirect(returnPath, 'roster=error');
  const { user } = await requireSession(returnPath);
  let outcome: 'offsite' | 'cap' | 'error' = 'offsite';
  try {
    await handlers.setTeamExtraMembers.execute(new SetTeamExtraMembersCommand(teamId, n, user.id));
  } catch (err) {
    if (err instanceof InvariantViolation && /cap/i.test(err.message)) outcome = 'cap';
    else if (isKnownTeamError(err)) outcome = 'error';
    else throw err;
  }
  revalidatePath(returnPath);
  flashRedirect(returnPath, `roster=${outcome}`);
}

export async function removeMemberFromForm(
  teamId: string,
  userId: string,
  returnPath: string,
): Promise<void> {
  const { user } = await requireSession(returnPath);
  let outcome: 'removed' | 'error' = 'removed';
  try {
    await handlers.removeTeamMember.execute(new RemoveTeamMemberCommand(teamId, userId, user.id));
  } catch (err) {
    if (isKnownTeamError(err)) outcome = 'error';
    else throw err;
  }
  revalidatePath(returnPath);
  flashRedirect(returnPath, `roster=${outcome}`);
}

/**
 * Captain renames the team. Bound at the call site:
 *   `renameTeamFromForm.bind(null, teamId, returnPath)`.
 * Captain-only; the handler enforces it. Signals via the `team` flash param.
 */
export async function renameTeamFromForm(
  teamId: string,
  returnPath: string,
  formData: FormData,
): Promise<void> {
  const name = field(formData, 'name').trim();
  if (name.length < 1 || name.length > 80) flashRedirect(returnPath, 'team=invalid');
  const { user } = await requireSession(returnPath);
  let outcome: 'renamed' | 'invalid' | 'error' = 'renamed';
  try {
    await handlers.renameTeam.execute(new RenameTeamCommand(teamId, name, user.id));
  } catch (err) {
    // Bad name (empty after trim / profane) is actionable; everything else is generic.
    if (err instanceof ValidationError || err instanceof InvariantViolation) outcome = 'invalid';
    else if (isKnownTeamError(err)) outcome = 'error';
    else throw err;
  }
  revalidatePath(returnPath);
  flashRedirect(returnPath, `team=${outcome}`);
}
