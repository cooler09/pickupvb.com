'use server';

/**
 * Seeding tool → event bracket write-back (tournament-tools-workflow audit
 * TT-2). Applies the computed seed order to the division's bracket via the
 * unchanged `SeedBracketCommand` (the same handler the bracket page's
 * seeding-list uses). The bracket must already exist and be in `setup` — the
 * handler raises `NotFoundError` / `InvariantViolation` otherwise, surfaced here
 * as a typed reason.
 *
 * The island has already mapped the seeded names back to the registered teams'
 * `entry_id`s and validated the set, so this adapter just runs the command.
 * Client-invoked → returns a typed result (AGENTS.md), not a redirect.
 */

import { revalidatePath, updateTag } from 'next/cache';
import { SeedBracketCommand } from '@pickupvb/application';
import {
  ConflictError,
  InvariantViolation,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { eventCacheTag } from '@/lib/cache-tags';
import { requireRealUser } from '@/lib/server-auth';

export type ApplySeedReason = 'forbidden' | 'conflict' | 'notfound' | 'invalid' | 'error';

export type ApplySeedResult =
  | { ok: true }
  | { ok: false; reason: ApplySeedReason; message?: string };

function classify(err: unknown): ApplySeedReason {
  if (err instanceof UnauthorizedError) return 'forbidden';
  if (err instanceof ConflictError) return 'conflict';
  if (err instanceof NotFoundError) return 'notfound';
  if (err instanceof ValidationError || err instanceof InvariantViolation) return 'invalid';
  return 'error';
}

export async function applySeedingToBracket(input: {
  eventId: string;
  divisionId: string;
  ret: string;
  orderedEntryIds: ReadonlyArray<string>;
}): Promise<ApplySeedResult> {
  const { user } = await requireRealUser();
  const { eventId, divisionId, ret, orderedEntryIds } = input;

  if (orderedEntryIds.length === 0) {
    return { ok: false, reason: 'invalid', message: 'No teams to seed.' };
  }

  try {
    await handlers.seedBracket.execute(
      new SeedBracketCommand(divisionId, user.id, [...orderedEntryIds]),
    );
  } catch (err) {
    return {
      ok: false,
      reason: classify(err),
      ...(err instanceof Error ? { message: err.message } : {}),
    };
  }

  revalidatePath(ret);
  updateTag(eventCacheTag(eventId));
  return { ok: true };
}
