'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { AddEventCoHostCommand, RemoveEventCoHostCommand } from '@pickupvb/application';
import {
  ConflictError,
  DomainError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { redirectEventNotice } from '@/lib/server-redirects';
import { requireSession } from '@/lib/server-auth';

/**
 * Server action wrappers around AddEventCoHostCommand / RemoveEventCoHostCommand
 * that translate typed domain errors into a `?cohost=…` flash on the event
 * page rather than letting them bubble to the React error boundary.
 *
 * Flash codes (consumed by `EventFlashBanners`):
 *   unauthorized — caller is not the primary host
 *   notfound     — event / user / group could not be resolved
 *   conflict     — the party is already a co-host (or the primary host)
 *   invalid      — request shape was rejected at the boundary
 *   error        — anything else (message also passed via `cohost_msg`)
 */
function flash(eventId: string, code: string, msg?: string): never {
  redirectEventNotice(eventId, 'cohost', code, msg);
}

function mapErrorAndFlash(eventId: string, err: unknown): never {
  if (err instanceof UnauthorizedError) flash(eventId, 'unauthorized');
  if (err instanceof NotFoundError) flash(eventId, 'notfound');
  if (err instanceof ConflictError) flash(eventId, 'conflict');
  if (err instanceof ValidationError) flash(eventId, 'invalid');
  if (err instanceof DomainError) flash(eventId, 'error', err.message);
  throw err;
}

export async function addEventCoHost(
  eventId: string,
  party: { userId?: string; groupId?: string },
  returnPath?: string,
): Promise<void> {
  if (!eventId || (!party.userId && !party.groupId)) return;
  const { user } = await requireSession();
  try {
    await handlers.addEventCoHost.execute(new AddEventCoHostCommand(eventId, party, user.id));
  } catch (err) {
    mapErrorAndFlash(eventId, err);
  }
  // Pair revalidatePath with updateTag so the cached public read-model
  // (loadEventReadModelPublic, tagged `event:${id}`) is also evicted.
  // revalidatePath alone only busts the page render cache.
  updateTag(`event:${eventId}`);
  if (returnPath) revalidatePath(returnPath);
}

export async function removeEventCoHost(
  eventId: string,
  party: { userId?: string; groupId?: string },
  returnPath?: string,
): Promise<void> {
  if (!eventId) return;
  const { user } = await requireSession();
  try {
    await handlers.removeEventCoHost.execute(new RemoveEventCoHostCommand(eventId, party, user.id));
  } catch (err) {
    mapErrorAndFlash(eventId, err);
  }
  updateTag(`event:${eventId}`);
  if (returnPath) revalidatePath(returnPath);
}

/**
 * Form-bound wrapper used by the "Add co-host" disclosure on the event
 * detail page. Reads `kind` ("group" | "user") + the corresponding id field
 * out of the FormData, then delegates to `addEventCoHost`.
 */
export async function addCoHostFromForm(
  eventId: string,
  returnPath: string,
  formData: FormData,
): Promise<void> {
  const kind = String(formData.get('kind') ?? '');
  if (kind === 'group') {
    const groupId = String(formData.get('group_id') ?? '').trim();
    if (groupId) await addEventCoHost(eventId, { groupId }, returnPath);
  } else if (kind === 'user') {
    const userId = String(formData.get('user_id') ?? '').trim();
    if (userId) await addEventCoHost(eventId, { userId }, returnPath);
  }
}
