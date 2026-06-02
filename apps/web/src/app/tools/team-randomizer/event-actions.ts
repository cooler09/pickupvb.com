'use server';

/**
 * Team randomizer → event write-back (tournament-tools-workflow audit TT-2).
 *
 * Takes the teams the randomizer just generated and registers each as a
 * walk-in team on the event (ADR 0017) — the same pipeline the bracket's
 * walk-in form uses. Walk-ins carry `captain_id = null`: the host is the
 * creator, not a player, so recording them as captain would falsely credit
 * them downstream (badge stats, "your upcoming events", "my teams"). The
 * handler re-verifies the caller is the event host before writing; RLS is the
 * second gate. There is no "one team per captain" check to bypass — walk-ins
 * have no captain account.
 *
 * Client-invoked (from the randomizer island under `useTransition`), so it
 * returns a typed result rather than `redirect()`-ing (AGENTS.md server-action
 * convention). `created` lets the UI report partial progress if a later team
 * fails mid-loop.
 */

import { revalidatePath, updateTag } from 'next/cache';
import { RegisterWalkInTeamCommand } from '@pickupvb/application';
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

export type SaveTeamsReason = 'forbidden' | 'conflict' | 'notfound' | 'invalid' | 'error';

export type SaveTeamsResult =
  | { ok: true; created: number }
  | { ok: false; reason: SaveTeamsReason; created: number; message?: string };

function classify(err: unknown): SaveTeamsReason {
  if (err instanceof UnauthorizedError) return 'forbidden';
  if (err instanceof ConflictError) return 'conflict';
  if (err instanceof NotFoundError) return 'notfound';
  if (err instanceof ValidationError || err instanceof InvariantViolation) return 'invalid';
  return 'error';
}

export async function saveRandomTeamsToEvent(input: {
  eventId: string;
  divisionId: string;
  ret: string;
  teams: ReadonlyArray<{ name: string; players: ReadonlyArray<string> }>;
}): Promise<SaveTeamsResult> {
  const { user } = await requireRealUser();
  const { eventId, divisionId, ret, teams } = input;

  const valid = teams
    .map((t) => ({
      name: t.name.trim(),
      players: t.players.map((p) => p.trim()).filter((p) => p.length > 0),
    }))
    .filter((t) => t.players.length > 0);

  if (valid.length === 0) {
    return { ok: false, reason: 'invalid', created: 0, message: 'No teams to save.' };
  }

  let created = 0;
  try {
    for (const [i, team] of valid.entries()) {
      const teamName = team.name || `Team ${i + 1}`;
      const members = team.players.map((displayName) => ({
        displayName,
        email: null,
        userId: null,
      }));
      // Walk-in (captain_id null): the host is the creator, not a player. The
      // team name stands in for the required freeform captain display name.
      await handlers.registerWalkInTeam.execute(
        new RegisterWalkInTeamCommand(
          eventId,
          divisionId,
          user.id,
          teamName,
          teamName,
          null,
          members,
        ),
      );
      created += 1;
    }
  } catch (err) {
    revalidatePath(ret);
    updateTag(eventCacheTag(eventId));
    return {
      ok: false,
      reason: classify(err),
      created,
      ...(err instanceof Error ? { message: err.message } : {}),
    };
  }

  revalidatePath(ret);
  updateTag(eventCacheTag(eventId));
  return { ok: true, created };
}
