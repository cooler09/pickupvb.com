'use server';

import { revalidatePath } from 'next/cache';
import { JoinEventAsFreeAgentCommand, LeaveEventAsFreeAgentCommand } from '@pickupvb/application';
import { ConflictError, InvariantViolation, NotFoundError } from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { getServerSupabase } from '@/lib/supabase';
import { redirectEventNotice } from '@/lib/server-redirects';

/**
 * Free-agent signup actions for tournaments. Mirrors the rsvp-actions
 * pattern: domain errors flow back to the event page via `?fa=…` flash
 * codes instead of blowing up.
 *
 * Flash codes:
 *   joined   — newly signed up
 *   already  — already in the free-agent pool
 *   left     — removed from the pool
 *   notin    — leave attempted but not in the pool
 *   closed   — event isn't open / wrong type
 *   signin   — no session
 *   anon     — anonymous session (must claim account first)
 *   error    — anything else (last_error in `fa_msg`)
 */
function back(eventId: string, code: string, msg?: string): never {
  redirectEventNotice(eventId, 'fa', code, msg);
}

async function authedUserIdOrFlash(eventId: string): Promise<string> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) back(eventId, 'signin');
  if ((user as { is_anonymous?: boolean }).is_anonymous) back(eventId, 'anon');
  return user.id;
}

/**
 * Bound at the call site:
 *   joinAsFreeAgentFromForm.bind(null, eventId)
 * Reads `division_id` (required) and optional `notes` from the form.
 */
export async function joinAsFreeAgentFromForm(eventId: string, formData: FormData): Promise<void> {
  const userId = await authedUserIdOrFlash(eventId);
  const raw = String(formData.get('notes') ?? '').trim();
  const notes = raw.length > 0 ? raw.slice(0, 280) : null;
  const divisionId = String(formData.get('division_id') ?? '').trim();
  if (!divisionId) back(eventId, 'division_required');

  try {
    await handlers.joinEventAsFreeAgent.execute(
      new JoinEventAsFreeAgentCommand(eventId, userId, notes, divisionId),
    );
  } catch (err) {
    if (err instanceof ConflictError) {
      revalidatePath(`/events/${eventId}`);
      back(eventId, 'already');
    }
    if (err instanceof InvariantViolation) back(eventId, 'closed');
    if (err instanceof NotFoundError) back(eventId, 'closed');
    const m = err instanceof Error ? err.message : String(err);
    back(eventId, 'error', m);
  }
  revalidatePath(`/events/${eventId}`);
  back(eventId, 'joined');
}

export async function leaveAsFreeAgent(eventId: string): Promise<void> {
  const userId = await authedUserIdOrFlash(eventId);
  try {
    await handlers.leaveEventAsFreeAgent.execute(new LeaveEventAsFreeAgentCommand(eventId, userId));
  } catch (err) {
    if (err instanceof NotFoundError) {
      revalidatePath(`/events/${eventId}`);
      back(eventId, 'notin');
    }
    const m = err instanceof Error ? err.message : String(err);
    back(eventId, 'error', m);
  }
  revalidatePath(`/events/${eventId}`);
  back(eventId, 'left');
}
