'use server';

import { revalidatePath } from 'next/cache';
import {
  AddTeamMemberCommand,
  JoinEventAsFreeAgentCommand,
  LeaveEventAsFreeAgentCommand,
} from '@pickupvb/application';
import {
  ConflictError,
  InvariantViolation,
  NotFoundError,
  UnauthorizedError,
} from '@pickupvb/domain';
import { createSupabaseAdminClient } from '@pickupvb/supabase';
import { handlers } from '@/lib/handlers';
import { getServerSupabase } from '@/lib/supabase';
import { redirectEventNotice } from '@/lib/server-redirects';
import { notify } from '@/lib/notify';

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
    if (err instanceof InvariantViolation) {
      // R2: division opted out of free agents — distinct flash so the
      // panel can render an actionable message instead of the generic
      // "isn't open" line.
      if (/free-agent signups/i.test(err.message)) back(eventId, 'fa_disabled');
      back(eventId, 'closed');
    }
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

/**
 * Captain picks a free agent up onto their roster team (the free-agent
 * memory's "Bucket-3" seam, ADR-less). First-class pickup = (1) invite the
 * agent to the captain's team registered in the agent's division, (2) clear
 * their free-agent pool entry, (3) fire `event.free_agent.picked_up`. Bound at
 * the call site: `pickUpFreeAgent.bind(null, eventId, divisionId, targetUserId)`.
 *
 * The target team is resolved server-side (the caller's roster entry in that
 * division) so the captain check + division match can't be spoofed from the
 * client. The invite is pending until the agent accepts (team membership is
 * invite-accept); clearing the pool on pickup stops two captains racing for the
 * same agent — a declined agent can re-join the pool.
 */
export async function pickUpFreeAgent(
  eventId: string,
  divisionId: string,
  targetUserId: string,
): Promise<void> {
  const captainId = await authedUserIdOrFlash(eventId);
  if (!divisionId || !targetUserId || targetUserId === captainId) back(eventId, 'error');

  const admin = createSupabaseAdminClient();

  // The caller's roster team in the agent's division (captain-scoped). No row →
  // they haven't registered a team there, so there's nothing to pick up onto.
  const { data: entry } = await admin
    .from('event_team_entries')
    .select('team_id, teams:teams!inner(slug, name)')
    .eq('division_id', divisionId)
    .eq('source', 'roster')
    .eq('captain_id', captainId)
    .not('team_id', 'is', null)
    .is('deleted_at', null)
    .maybeSingle();
  const row = entry as { team_id: string; teams: { slug: string; name: string } | null } | null;
  if (!row?.team_id || !row.teams) back(eventId, 'fa_no_team');
  const teamId = row.team_id;
  const teamName = row.teams.name;
  const teamSlug = row.teams.slug;

  // Invite the agent (pending unless they auto-accept). Captain-only — the
  // handler re-checks the requester is the team captain.
  const { data: pref } = await admin
    .from('profiles')
    .select('auto_accept_team_invites')
    .eq('id', targetUserId)
    .maybeSingle();
  const autoAccept = Boolean(
    (pref as { auto_accept_team_invites: boolean | null } | null)?.auto_accept_team_invites,
  );
  try {
    await handlers.addTeamMember.execute(
      new AddTeamMemberCommand(teamId, targetUserId, captainId, autoAccept),
    );
  } catch (err) {
    if (err instanceof ConflictError) back(eventId, 'fa_already_member');
    if (err instanceof UnauthorizedError) back(eventId, 'forbidden');
    const m = err instanceof Error ? err.message : String(err);
    back(eventId, 'error', m);
  }

  // Clear the pool entry now that they're rostered/invited. NotFound (already
  // gone — a race) is fine.
  try {
    await handlers.leaveEventAsFreeAgent.execute(
      new LeaveEventAsFreeAgentCommand(eventId, targetUserId),
    );
  } catch (err) {
    if (!(err instanceof NotFoundError)) {
      const m = err instanceof Error ? err.message : String(err);
      back(eventId, 'error', m);
    }
  }

  // Best-effort pickup ping with the team context (deep-links to accept).
  try {
    const [{ data: ev }, { data: cap }] = await Promise.all([
      admin.from('events').select('title').eq('id', eventId).maybeSingle(),
      admin.from('profiles_public').select('display_name').eq('id', captainId).maybeSingle(),
    ]);
    const eventTitle = (ev as { title: string } | null)?.title ?? 'an event';
    const captainName =
      (cap as { display_name: string | null } | null)?.display_name ?? 'A captain';
    await notify(
      'event.free_agent.picked_up',
      targetUserId,
      { eventTitle, teamName, teamSlug, captainName },
      { idempotencyKey: `${teamId}:${targetUserId}` },
    );
  } catch {
    // best-effort
  }

  revalidatePath(`/events/${eventId}`);
  back(eventId, 'picked_up');
}
