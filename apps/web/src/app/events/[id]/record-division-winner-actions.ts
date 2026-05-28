'use server';

import { revalidatePath } from 'next/cache';
import { GetEventDetailQuery } from '@pickupvb/application';
import { handlers } from '@/lib/handlers';
import { getViewer } from '@/lib/server-auth';
import { getServerSupabase } from '@/lib/supabase';
import { field } from '@/lib/form-data';
import { redirectEventNotice } from '@/lib/server-redirects';

/**
 * Host-only: record the winning team for a division. The selected team may
 * either be a roster-mode entry (a row in `teams` linked via `event_teams`)
 * or an ad-hoc registration (`event_team_registrations`). The two FK columns
 * on `event_divisions` are mutually exclusive (DB CHECK).
 *
 * Bound from the JSX as `recordDivisionWinner.bind(null, eventId, divisionId, returnPath)`.
 *
 * The form must submit a single `team` field shaped as `"team:<uuid>"` or
 * `"registration:<uuid>"` (set as the `value` of the dropdown options).
 */
export async function recordDivisionWinner(
  eventId: string,
  divisionId: string,
  returnPath: string,
  formData: FormData,
): Promise<void> {
  const viewer = await getViewer();
  if (!viewer || viewer.isAnonymous) {
    redirectEventNotice(eventId, 'rsvp', 'forbidden');
  }

  const detail = await handlers.getEventDetail.execute(
    new GetEventDetailQuery(eventId, viewer.user.id),
  );
  if (!detail.canManage) {
    redirectEventNotice(eventId, 'rsvp', 'forbidden');
  }

  const raw = field(formData, 'team');
  const [kind, id] = raw.split(':');
  if ((kind !== 'team' && kind !== 'registration') || !id) {
    redirectEventNotice(eventId, 'rsvp', 'winner_invalid');
  }

  const supabase = await getServerSupabase();

  // Validate the chosen team actually belongs to this division on this event.
  if (kind === 'team') {
    const { data, error } = await supabase
      .from('event_teams')
      .select('team_id, division_id, event_id')
      .eq('event_id', eventId)
      .eq('team_id', id)
      .eq('division_id', divisionId)
      .maybeSingle();
    if (error || !data) {
      redirectEventNotice(eventId, 'rsvp', 'winner_invalid');
    }
  } else {
    const { data, error } = await supabase
      .from('event_team_registrations')
      .select('id, division_id')
      .eq('id', id)
      .eq('division_id', divisionId)
      .maybeSingle();
    if (error || !data) {
      redirectEventNotice(eventId, 'rsvp', 'winner_invalid');
    }
  }

  const update =
    kind === 'team'
      ? {
          winner_team_id: id,
          winner_team_registration_id: null,
          winner_recorded_at: new Date().toISOString(),
        }
      : {
          winner_team_id: null,
          winner_team_registration_id: id,
          winner_recorded_at: new Date().toISOString(),
        };

  const { error: updErr } = await supabase
    .from('event_divisions')
    .update(update as never)
    .eq('id', divisionId)
    .eq('event_id', eventId);
  if (updErr) {
    redirectEventNotice(eventId, 'rsvp', 'winner_save_failed', updErr.message);
  }

  revalidatePath(returnPath);
  redirectEventNotice(eventId, 'rsvp', 'winner_recorded');
}

/**
 * Host-only: clear a previously recorded winner for a division.
 *
 * Bound from the JSX as `clearDivisionWinner.bind(null, eventId, divisionId, returnPath)`.
 * Plain `<form action={...}>` — no FormData fields needed.
 */
export async function clearDivisionWinner(
  eventId: string,
  divisionId: string,
  returnPath: string,
): Promise<void> {
  const viewer = await getViewer();
  if (!viewer || viewer.isAnonymous) {
    redirectEventNotice(eventId, 'rsvp', 'forbidden');
  }

  const detail = await handlers.getEventDetail.execute(
    new GetEventDetailQuery(eventId, viewer.user.id),
  );
  if (!detail.canManage) {
    redirectEventNotice(eventId, 'rsvp', 'forbidden');
  }

  const supabase = await getServerSupabase();
  const { error: updErr } = await supabase
    .from('event_divisions')
    .update({
      winner_team_id: null,
      winner_team_registration_id: null,
      winner_recorded_at: null,
    } as never)
    .eq('id', divisionId)
    .eq('event_id', eventId);
  if (updErr) {
    redirectEventNotice(eventId, 'rsvp', 'winner_save_failed', updErr.message);
  }

  revalidatePath(returnPath);
  redirectEventNotice(eventId, 'rsvp', 'winner_cleared');
}
