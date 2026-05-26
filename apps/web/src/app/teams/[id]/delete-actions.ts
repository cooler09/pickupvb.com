'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ConflictError, NotFoundError, UnauthorizedError } from '@pickupvb/domain';
import { requireRealUser } from '@/lib/server-auth';
import { getAdminSupabase } from '@/lib/supabase-admin';

type State = { error?: string; ok?: boolean };

/**
 * Soft-delete a team. Captain-only.
 *
 * Refuses if the team is registered for any non-cancelled, future-dated
 * event — the captain must withdraw the team from those events first
 * (or wait for the event to pass).
 *
 * Flips `teams.deleted_at`. RLS `teams_select` filters
 * `deleted_at is null`, so the row vanishes from every read path on
 * the next render. Historical `event_teams` rows are retained for
 * tournament records.
 */
export async function deleteTeamAction(
  teamId: string,
  _prev: State,
  _formData: FormData,
): Promise<State> {
  const { user, supabase } = await requireRealUser('/teams');

  try {
    const { data: teamRow } = await supabase
      .from('teams')
      .select('id, slug, captain_id')
      .eq('id', teamId)
      .maybeSingle();
    const team = teamRow as { id: string; slug: string; captain_id: string } | null;
    if (!team) throw new NotFoundError('team', teamId);
    if (team.captain_id !== user.id)
      throw new UnauthorizedError('Only the team captain can delete the team.');

    // Guard: refuse if registered for any upcoming non-cancelled event.
    // `event_teams` is the join; we filter the parent event in a nested
    // select with `!inner` so the row count reflects the join condition.
    const { data: futureRegRows } = await supabase
      .from('event_teams')
      .select('event_id, events:events!inner(id, status, starts_at)')
      .eq('team_id', teamId)
      .neq('events.status', 'cancelled')
      .gt('events.starts_at', new Date().toISOString());
    const futureRegs = (futureRegRows as unknown[] | null) ?? [];
    if (futureRegs.length > 0) {
      throw new ConflictError('This team is registered for upcoming events. Withdraw it first.');
    }

    // RLS quirk: see deleteGroupAction — `teams_select` filters `deleted_at
    // is null`, so Postgres rejects the user-scoped UPDATE because the
    // after-image would be invisible. Captain check is enforced above.
    const admin = getAdminSupabase();
    const { error: updErr } = await admin
      .from('teams')
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq('id', teamId);
    if (updErr) return { error: updErr.message };

    revalidatePath('/teams');
    revalidatePath('/profile');
    revalidatePath(`/teams/${team.slug}`);
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    if (err instanceof ConflictError) return { error: err.message };
    if (err instanceof NotFoundError) return { error: 'Team not found.' };
    throw err;
  }

  redirect('/teams?deleted=1');
}
