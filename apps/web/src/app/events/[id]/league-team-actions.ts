'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { eventCacheTag } from '@/lib/cache-tags';
import { SetLeagueTeamForfeitedCommand } from '@pickupvb/application';
import { DomainError, NotFoundError, UnauthorizedError, ValidationError } from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { requireSession } from '@/lib/server-auth';
import { redirectEventNotice } from '@/lib/server-redirects';

/**
 * Server actions for the host-tools "League teams" panel — minimal
 * forfeit affordance per ADR 0007 + audit P2 #7. Marks a rostered team
 * as withdrawn mid-season (or reinstates them) by setting / clearing
 * `event_team_entries.forfeited_at`. Schedule-generation downstream
 * can filter on the flag once we wire LeagueSchedule generation
 * (deferred follow-up).
 */

function flash(eventId: string, code: string, msg?: string): never {
  redirectEventNotice(eventId, 'forfeit', code, msg);
}

function mapErrorAndFlash(eventId: string, err: unknown): never {
  if (err instanceof UnauthorizedError) flash(eventId, 'unauthorized');
  if (err instanceof NotFoundError) flash(eventId, 'notfound');
  if (err instanceof ValidationError) flash(eventId, 'invalid');
  if (err instanceof DomainError) flash(eventId, 'error', err.message);
  throw err;
}

async function setForfeited(
  eventId: string,
  divisionId: string,
  entryId: string,
  forfeited: boolean,
  returnPath: string,
): Promise<void> {
  if (!eventId || !divisionId || !entryId) return;
  const { user } = await requireSession();
  try {
    await handlers.setLeagueTeamForfeited.execute(
      new SetLeagueTeamForfeitedCommand(eventId, divisionId, entryId, user.id, forfeited),
    );
  } catch (err) {
    mapErrorAndFlash(eventId, err);
  }
  updateTag(eventCacheTag(eventId));
  revalidatePath(returnPath);
}

export async function markLeagueTeamForfeitedFromForm(
  eventId: string,
  divisionId: string,
  entryId: string,
  returnPath: string,
  _formData: FormData,
): Promise<void> {
  await setForfeited(eventId, divisionId, entryId, true, returnPath);
}

export async function reinstateLeagueTeamFromForm(
  eventId: string,
  divisionId: string,
  entryId: string,
  returnPath: string,
  _formData: FormData,
): Promise<void> {
  await setForfeited(eventId, divisionId, entryId, false, returnPath);
}
