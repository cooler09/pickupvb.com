'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { eventCacheTag } from '@/lib/cache-tags';
import {
  AddEventCoHostCommand,
  GetEventDetailQuery,
  RemoveEventCoHostCommand,
} from '@pickupvb/application';
import {
  ConflictError,
  DomainError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { redirectEventNotice } from '@/lib/server-redirects';
import { getViewer } from '@/lib/server-auth';
import { recordAuditEvent } from '@/lib/audit-log';

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

/**
 * Co-host add/remove is a host-manager operation. The handler and the
 * `SupabaseEventRepository` it writes through run on the service-role admin
 * client (RLS bypassed — sanctioned for host-gated ops, AGENTS.md pitfall #8),
 * so authorization MUST be enforced here, not delegated to RLS. `canManage` is
 * the same host / co-host / group-owner-or-admin set the manage UI gates on.
 * Throws `UnauthorizedError` so the surrounding `mapErrorAndFlash` renders the
 * `?cohost=unauthorized` flash. (Security audit P1 #12.)
 */
async function assertCanManage(eventId: string): Promise<string> {
  const viewer = await getViewer();
  if (!viewer || viewer.isAnonymous) {
    throw new UnauthorizedError('You must be signed in as a host to manage co-hosts.');
  }
  const detail = await handlers.getEventDetail.execute(
    new GetEventDetailQuery(eventId, viewer.user.id),
  );
  if (!detail.canManage) {
    throw new UnauthorizedError('Only an event host can manage co-hosts.');
  }
  return viewer.user.id;
}

export async function addEventCoHost(
  eventId: string,
  party: { userId?: string; groupId?: string },
  returnPath?: string,
): Promise<void> {
  if (!eventId || (!party.userId && !party.groupId)) return;
  try {
    const userId = await assertCanManage(eventId);
    await handlers.addEventCoHost.execute(new AddEventCoHostCommand(eventId, party, userId));
    await recordAuditEvent({
      action: 'event.co_host_added',
      entityType: 'event',
      entityId: eventId,
      actorUserId: userId,
      targetUserId: party.userId ?? null,
      ...(party.groupId ? { metadata: { groupId: party.groupId } } : {}),
    });
  } catch (err) {
    mapErrorAndFlash(eventId, err);
  }
  // Pair revalidatePath with updateTag so the cached public read-model
  // (loadEventReadModelPublic, tagged `event:${id}`) is also evicted.
  // revalidatePath alone only busts the page render cache.
  updateTag(eventCacheTag(eventId));
  if (returnPath) revalidatePath(returnPath);
}

export async function removeEventCoHost(
  eventId: string,
  party: { userId?: string; groupId?: string },
  returnPath?: string,
): Promise<void> {
  if (!eventId) return;
  try {
    const userId = await assertCanManage(eventId);
    await handlers.removeEventCoHost.execute(new RemoveEventCoHostCommand(eventId, party, userId));
    await recordAuditEvent({
      action: 'event.co_host_removed',
      entityType: 'event',
      entityId: eventId,
      actorUserId: userId,
      targetUserId: party.userId ?? null,
      ...(party.groupId ? { metadata: { groupId: party.groupId } } : {}),
    });
  } catch (err) {
    mapErrorAndFlash(eventId, err);
  }
  updateTag(eventCacheTag(eventId));
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
