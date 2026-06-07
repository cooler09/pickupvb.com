'use server';

import { revalidatePath } from 'next/cache';
import {
  AddGroupMemberCommand,
  ChangeGroupMemberRoleCommand,
  RemoveGroupMemberCommand,
} from '@pickupvb/application';
import { DomainError } from '@pickupvb/domain';
import { requireSession } from '@/lib/server-auth';
import { getGroupHandlers } from '@/lib/handlers';
import { recordAuditEvent } from '@/lib/audit-log';

type Role = 'owner' | 'admin' | 'member';

/**
 * These run via plain `<form action={…}>` submissions (no client state). Before
 * the ADR 0021 migration they relied on RLS and silently swallowed the write
 * error, so an unauthorized attempt was a no-op. We preserve that UX: expected
 * `DomainError`s (unauthorized, last-owner invariant, conflict, not-found) are
 * swallowed; only genuinely unexpected failures bubble.
 */
async function runMemberOp(op: () => Promise<void>, returnPath?: string): Promise<void> {
  try {
    await op();
  } catch (err) {
    if (!(err instanceof DomainError)) throw err;
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
