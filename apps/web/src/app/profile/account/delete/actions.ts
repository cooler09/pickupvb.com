'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ConflictError, NotFoundError } from '@pickupvb/domain';
import { CancelAccountDeletionCommand, RequestAccountDeletionCommand } from '@pickupvb/application';
import { requireRealUser } from '@/lib/server-auth';
import { getAccountDeletionHandlers } from '@/lib/handlers';
import { notify } from '@/lib/notify';
import { field, fieldOrNull } from '@/lib/form-data';

const PATH = '/profile/account/delete';

/**
 * Arm account deletion. Plain `<form action>` → flash-param redirects on the
 * branches the page renders (AGENTS.md "Server-action error handling"). The
 * confirm phrase must be typed exactly; a duplicate request (already scheduled)
 * is a no-op that just shows the scheduled state.
 */
export async function requestAccountDeletion(formData: FormData): Promise<void> {
  const { user } = await requireRealUser(PATH);

  if (field(formData, 'confirm') !== 'DELETE') {
    redirect(`${PATH}?error=confirm`);
  }
  const reason = fieldOrNull(formData, 'reason', 500);

  try {
    const { requestAccountDeletion: handler } = await getAccountDeletionHandlers();
    const res = await handler.execute(new RequestAccountDeletionCommand(user.id, reason));
    await notify('account.deletion.requested', user.id, {
      scheduledFor: res.scheduledFor.toISOString(),
    });
  } catch (err) {
    // Already scheduled — fall through to render the scheduled state.
    if (!(err instanceof ConflictError)) throw err;
  }

  revalidatePath(PATH);
  redirect(`${PATH}?status=scheduled`);
}

/** Cancel a pending deletion within the grace window. */
export async function cancelAccountDeletion(): Promise<void> {
  const { user } = await requireRealUser(PATH);

  try {
    const { cancelAccountDeletion: handler } = await getAccountDeletionHandlers();
    await handler.execute(new CancelAccountDeletionCommand(user.id));
    await notify('account.deletion.cancelled', user.id, {});
  } catch (err) {
    // Nothing live to cancel (e.g. double-submit) — just refresh.
    if (!(err instanceof NotFoundError)) throw err;
  }

  revalidatePath(PATH);
  redirect(`${PATH}?status=cancelled`);
}
