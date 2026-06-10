'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import {
  AddGroupMemberCommand,
  ChangeGroupMemberRoleCommand,
  RemoveGroupMemberCommand,
} from '@pickupvb/application';
import {
  ConflictError,
  DomainError,
  InvariantViolation,
  NotFoundError,
  UnauthorizedError,
} from '@pickupvb/domain';
import { requireSession } from '@/lib/server-auth';
import { getGroupHandlers } from '@/lib/handlers';
import { recordAuditEvent } from '@/lib/audit-log';

type Role = 'owner' | 'admin' | 'member';

/**
 * Map an expected member-op `DomainError` to a flash reason code the
 * manage-members page renders as an `<Alert>` (GD-1). The Group aggregate's
 * only `InvariantViolation` here is the last-owner guard, so that maps to a
 * specific message rather than a generic error.
 */
function memberFlashReason(err: DomainError): string {
  if (err instanceof InvariantViolation) return 'last_owner';
  if (err instanceof ConflictError) return 'already';
  if (err instanceof UnauthorizedError) return 'forbidden';
  if (err instanceof NotFoundError) return 'gone';
  return 'error';
}

/**
 * These run via plain `<form action={…}>` submissions (no client state). Before
 * the ADR 0021 migration they relied on RLS and silently swallowed the write
 * error, so an unauthorized attempt was a no-op. Expected `DomainError`s
 * (unauthorized, last-owner invariant, conflict, not-found) used to be swallowed
 * with no feedback — a confusing dead-end on a routine action (GD-1). We now
 * surface them via a flash-param redirect (`?member=<reason>`) so the manager
 * sees why nothing changed; only genuinely unexpected failures bubble.
 */
async function runMemberOp(op: () => Promise<void>, returnPath?: string): Promise<void> {
  try {
    await op();
  } catch (err) {
    if (!(err instanceof DomainError)) throw err;
    // `redirect` throws NEXT_REDIRECT (not a DomainError), so it propagates.
    if (returnPath) redirect(`${returnPath}?member=${memberFlashReason(err)}` as Route);
    return;
  }
  if (returnPath) revalidatePath(returnPath);
}

export async function addGroupMember(
  groupId: string,
  userId: string,
  role: Role,
  returnPath?: string,
): Promise<void> {
  if (!groupId || !userId) return;
  const { user } = await requireSession();
  await runMemberOp(async () => {
    const { addGroupMember: handler } = await getGroupHandlers();
    await handler.execute(new AddGroupMemberCommand(groupId, user.id, userId, role));
    await recordAuditEvent({
      action: 'group_member.added',
      entityType: 'group',
      entityId: groupId,
      actorUserId: user.id,
      targetUserId: userId,
      metadata: { role },
    });
  }, returnPath);
}

export async function removeGroupMember(
  groupId: string,
  userId: string,
  returnPath?: string,
): Promise<void> {
  if (!groupId || !userId) return;
  const { user } = await requireSession();
  await runMemberOp(async () => {
    const { removeGroupMember: handler } = await getGroupHandlers();
    await handler.execute(new RemoveGroupMemberCommand(groupId, user.id, userId));
    await recordAuditEvent({
      action: 'group_member.removed',
      entityType: 'group',
      entityId: groupId,
      actorUserId: user.id,
      targetUserId: userId,
    });
  }, returnPath);
}

export async function changeGroupMemberRole(
  groupId: string,
  userId: string,
  role: Role,
  returnPath?: string,
): Promise<void> {
  if (!groupId || !userId) return;
  const { user } = await requireSession();
  await runMemberOp(async () => {
    const { changeGroupMemberRole: handler } = await getGroupHandlers();
    await handler.execute(new ChangeGroupMemberRoleCommand(groupId, user.id, userId, role));
    await recordAuditEvent({
      action: 'group_member.role_changed',
      entityType: 'group',
      entityId: groupId,
      actorUserId: user.id,
      targetUserId: userId,
      metadata: { role },
    });
  }, returnPath);
}
