'use server';

import { revalidatePath } from 'next/cache';
import {
  RecordLeagueMatchResultCommand,
  RecordMatchResultCommand,
  liveMatchScoreToLeagueScore,
  liveMatchScoreToMatchSets,
} from '@pickupvb/application';
import {
  ConflictError,
  InvariantViolation,
  LeagueMatchStatus,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  type LiveMatchScore,
} from '@pickupvb/domain';
import { getMatchResultHandlers } from '@/lib/handlers';
import { getServerSupabase } from '@/lib/supabase';
import { isPro } from '@/lib/pro';
import { requireRealUser } from '@/lib/server-auth';
import type { MatchBinding } from '../_lib/binding';

/**
 * Finalize a scoreboard's live score into the official match record — ADR 0023
 * Phase 4. Maps the terminal {@link LiveMatchScore} into the existing
 * `RecordMatchResultCommand` (bracket) / `RecordLeagueMatchResultCommand`
 * (league) and runs the unchanged, RLS-gated handlers (winner advancement,
 * standings come for free). This is the "score on the scoreboard → save the
 * result to the match" path; the manual entry forms remain.
 *
 * Client-invoked (from `ScoreboardView`), so it returns a typed result rather
 * than redirecting (AGENTS.md server-action error handling). Authorization is
 * two-layered: the host-level Pro gate is re-checked here, and "host or either
 * captain of this match" is enforced at the DB by the record RPCs behind
 * `getMatchResultHandlers()`.
 */

export type FinalizeReason =
  | 'pro_required'
  | 'forbidden'
  | 'conflict'
  | 'notfound'
  | 'invalid'
  | 'error';

export type FinalizeResult = { ok: true } | { ok: false; reason: FinalizeReason; message?: string };

function classify(err: unknown): FinalizeResult {
  if (err instanceof UnauthorizedError)
    return { ok: false, reason: 'forbidden', message: err.message };
  if (err instanceof ConflictError) return { ok: false, reason: 'conflict', message: err.message };
  if (err instanceof NotFoundError) return { ok: false, reason: 'notfound', message: err.message };
  if (err instanceof InvariantViolation)
    return { ok: false, reason: 'invalid', message: err.message };
  if (err instanceof ValidationError) return { ok: false, reason: 'invalid', message: err.message };
  return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
}

export async function finalizeMatchFromScoreboard(
  binding: MatchBinding,
  state: LiveMatchScore,
): Promise<FinalizeResult> {
  const { user } = await requireRealUser();

  // Host-level Pro gate (ADR 0023 §5). The entry button only renders for
  // Pro-host events; this re-check is defense-in-depth for a crafted call.
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from('events')
    .select('host_id')
    .eq('id', binding.eventId)
    .maybeSingle();
  const hostId = (data as { host_id: string } | null)?.host_id ?? null;
  if (!hostId || !(await isPro(hostId))) {
    return { ok: false, reason: 'pro_required' };
  }

  try {
    const matchHandlers = await getMatchResultHandlers();
    if (binding.kind === 'bracket') {
      const sets = liveMatchScoreToMatchSets(state);
      if (sets.length === 0) {
        return { ok: false, reason: 'invalid', message: 'No sets have been played yet.' };
      }
      await matchHandlers.recordMatchResult.execute(
        new RecordMatchResultCommand(binding.matchId, user.id, sets),
      );
      revalidatePath(`/events/${binding.eventId}/bracket`);
    } else {
      const { home, away } = liveMatchScoreToLeagueScore(state);
      await matchHandlers.recordLeagueMatchResult.execute(
        new RecordLeagueMatchResultCommand(
          binding.divisionId,
          binding.matchId,
          user.id,
          home,
          away,
          LeagueMatchStatus.Completed,
        ),
      );
      revalidatePath(`/events/${binding.eventId}/schedule`);
    }
  } catch (err) {
    return classify(err);
  }

  revalidatePath(`/events/${binding.eventId}`);
  if (binding.returnPath) revalidatePath(binding.returnPath);
  return { ok: true };
}
