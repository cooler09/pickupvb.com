'use server';

import { revalidatePath } from 'next/cache';
import { GetEventDetailQuery } from '@pickupvb/application';
import { handlers } from '@/lib/handlers';
import { getViewer } from '@/lib/server-auth';
import { getServerSupabase } from '@/lib/supabase';
import { field } from '@/lib/form-data';
import { redirectEventNotice } from '@/lib/server-redirects';

/**
 * Host-only: record a division placement (1st / 2nd / 3rd) — the "true podium"
 * (gamification Phase 2 follow-up). Generalizes the original winner-only flow:
 * `place` selects which `event_divisions.{winner,runner_up,third_place}_entry_id`
 * column to write. The winner column additionally stamps `winner_recorded_at`.
 *
 * The selected team may be a roster-mode entry (a `teams` row linked via
 * `event_team_entries.team_id`) or an ad-hoc/walk-in registration (an entry with
 * `source <> 'roster'`); both resolve to a canonical `event_team_entries.id`.
 *
 * Runs on the user-scoped client so the `event_divisions` UPDATE RLS (event
 * host) is the real gate. Bound from the JSX as
 * `recordDivisionPlacement.bind(null, eventId, divisionId, place, returnPath)`.
 */

type Placement = 'winner' | 'runner_up' | 'third';

const PLACEMENT_COLUMN: Record<Placement, string> = {
  winner: 'winner_entry_id',
  runner_up: 'runner_up_entry_id',
  third: 'third_place_entry_id',
};

async function assertCanManage(eventId: string): Promise<string> {
  const viewer = await getViewer();
  if (!viewer || viewer.isAnonymous) redirectEventNotice(eventId, 'rsvp', 'forbidden');
  const detail = await handlers.getEventDetail.execute(
    new GetEventDetailQuery(eventId, viewer.user.id),
  );
  if (!detail.canManage) redirectEventNotice(eventId, 'rsvp', 'forbidden');
  return viewer.user.id;
}

export async function recordDivisionPlacement(
  eventId: string,
  divisionId: string,
  place: Placement,
  returnPath: string,
  formData: FormData,
): Promise<void> {
  await assertCanManage(eventId);
  const column = PLACEMENT_COLUMN[place];
  if (!column) redirectEventNotice(eventId, 'rsvp', 'winner_invalid');

  const raw = field(formData, 'team');
  const [kind, id] = raw.split(':');
  if ((kind !== 'team' && kind !== 'registration') || !id) {
    redirectEventNotice(eventId, 'rsvp', 'winner_invalid');
  }

  const supabase = await getServerSupabase();

  // Resolve the canonical `event_team_entries.id` for the chosen team, scoped to
  // this division. roster vs ad-hoc only changes how we look the entry up.
  const lookup =
    kind === 'team'
      ? supabase
          .from('event_team_entries')
          .select('id')
          .eq('team_id', id)
          .eq('division_id', divisionId)
          .eq('source', 'roster')
          .is('deleted_at', null)
          .maybeSingle()
      : supabase
          .from('event_team_entries')
          .select('id')
          .eq('id', id)
          .eq('division_id', divisionId)
          .neq('source', 'roster')
          .is('deleted_at', null)
          .maybeSingle();
  const { data, error } = await lookup;
  if (error || !data) redirectEventNotice(eventId, 'rsvp', 'winner_invalid');
  const entryId = (data as { id: string }).id;

  const update: Record<string, unknown> = { [column]: entryId };
  if (place === 'winner') update.winner_recorded_at = new Date().toISOString();

  const { error: updErr } = await supabase
    .from('event_divisions')
    .update(update as never)
    .eq('id', divisionId)
    .eq('event_id', eventId);
  if (updErr) redirectEventNotice(eventId, 'rsvp', 'winner_save_failed', updErr.message);

  revalidatePath(returnPath);
  redirectEventNotice(eventId, 'rsvp', 'winner_recorded');
}

/**
 * Host-only: clear a recorded placement for a division.
 * Bound as `clearDivisionPlacement.bind(null, eventId, divisionId, place, returnPath)`.
 */
export async function clearDivisionPlacement(
  eventId: string,
  divisionId: string,
  place: Placement,
  returnPath: string,
): Promise<void> {
  await assertCanManage(eventId);
  const column = PLACEMENT_COLUMN[place];
  if (!column) redirectEventNotice(eventId, 'rsvp', 'winner_invalid');

  const update: Record<string, unknown> = { [column]: null };
  if (place === 'winner') update.winner_recorded_at = null;

  const supabase = await getServerSupabase();
  const { error: updErr } = await supabase
    .from('event_divisions')
    .update(update as never)
    .eq('id', divisionId)
    .eq('event_id', eventId);
  if (updErr) redirectEventNotice(eventId, 'rsvp', 'winner_save_failed', updErr.message);

  revalidatePath(returnPath);
  redirectEventNotice(eventId, 'rsvp', 'winner_cleared');
}
