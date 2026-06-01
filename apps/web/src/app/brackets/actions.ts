'use server';

import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  AddBracketTeamCommand,
  CreateStandaloneBracketCommand,
  GenerateStandaloneBracketCommand,
  GenerateStandalonePlayoffCommand,
  RecordMatchResultCommand,
  ReorderStandalonePoolMatchesCommand,
  ResetStandaloneBracketCommand,
  ResetMatchCommand,
  SeedStandaloneBracketCommand,
} from '@pickupvb/application';
import {
  ConflictError,
  InvariantViolation,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  type BracketConfig,
  type BracketFormat,
  type MatchSet,
} from '@pickupvb/domain';
import { getMatchResultHandlers, handlers } from '@/lib/handlers';
import { requireRealUser } from '@/lib/server-auth';
import { validateActiveBracketCap } from '@/lib/standalone-bracket-cap';

/**
 * Server actions for standalone (event-free) brackets — ADR 0025. Owner-gated
 * mutations are guarded inside the handlers (`bracket.ownerUserId ===
 * requesterId`); match-result recording reuses the event path's user-scoped
 * `getMatchResultHandlers()` so the `record_bracket_match_result` RPC's owner
 * branch is the second line of defense.
 *
 * Mirrors `apps/web/src/app/events/[id]/bracket/actions.ts` but keyed on the
 * bracket id (no event/division) and redirecting to `/brackets/[id]?notice=`.
 */

const path = (bracketId: string, notice: string, msg?: string): string => {
  const params = new URLSearchParams({ notice });
  if (msg) params.set('msg', msg);
  return `/brackets/${bracketId}?${params.toString()}`;
};

function back(bracketId: string, notice: string, msg?: string): never {
  redirect(path(bracketId, notice, msg) as Route);
}

function revalidate(bracketId: string): void {
  revalidatePath(`/brackets/${bracketId}`);
}

function classify(err: unknown): { code: string; msg: string } {
  if (err instanceof UnauthorizedError) return { code: 'forbidden', msg: err.message };
  if (err instanceof ConflictError) return { code: 'conflict', msg: err.message };
  if (err instanceof NotFoundError) return { code: 'notfound', msg: err.message };
  if (err instanceof InvariantViolation) return { code: 'invalid', msg: err.message };
  if (err instanceof ValidationError) return { code: 'invalid', msg: err.message };
  return { code: 'error', msg: err instanceof Error ? err.message : String(err) };
}

/** Parse format + config from the format-picker form (mirrors the event-path
 *  `createBracketFromForm` parsing). */
function parseConfig(formData: FormData): {
  format: BracketFormat;
  config: Partial<BracketConfig> | undefined;
} {
  const format = String(formData.get('format') ?? 'single_elimination') as BracketFormat;
  const config: Partial<BracketConfig> = {};
  const bestOf = Number(formData.get('best_of') ?? '');
  if (bestOf === 1 || bestOf === 3 || bestOf === 5) config.bestOf = bestOf;
  if (format === 'pool_play_playoff') {
    const poolCount = Number(formData.get('pool_count') ?? '');
    const advance = Number(formData.get('advance_per_pool') ?? '');
    if (Number.isFinite(poolCount) && poolCount >= 2) config.poolCount = poolCount;
    if (Number.isFinite(advance) && advance >= 1) config.advancePerPool = advance;
    const schedule = String(formData.get('pool_schedule') ?? '');
    if (schedule === 'round_robin' || schedule === 'fixed_games') {
      config.poolSchedule = schedule;
      if (schedule === 'fixed_games') {
        const games = Number(formData.get('pool_games_per_team') ?? '');
        if (Number.isFinite(games) && games >= 1) config.poolGamesPerTeam = games;
      }
    }
    if (formData.get('require_work_team') != null) config.requireWorkTeam = true;
    const rawCourts = String(formData.get('court_labels') ?? '');
    const courts = rawCourts
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (courts.length > 0) config.courtLabels = courts;
    const courtsByPool: Record<string, string[]> = {};
    for (const [key, val] of formData.entries()) {
      if (!key.startsWith('pool_courts_')) continue;
      const label = key.slice('pool_courts_'.length);
      const list = String(val)
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (list.length > 0) courtsByPool[label] = list;
    }
    if (Object.keys(courtsByPool).length > 0) config.courtsByPool = courtsByPool;
  }
  return { format, config: Object.keys(config).length > 0 ? config : undefined };
}

export async function createStandaloneBracketFromForm(formData: FormData): Promise<void> {
  const { user } = await requireRealUser();
  // Free-tier cap: 1 active (non-completed) standalone bracket; Pro unlimited
  // (ADR 0025 addendum / monetization R-3). The /brackets/new page renders a
  // proactive upsell when capped; this is the server-side gate for a crafted or
  // raced submit. `redirect` throws, so it must sit outside the try below.
  const cap = await validateActiveBracketCap(user.id);
  if (!cap.ok) {
    redirect(`/brackets/new?notice=cap&msg=${encodeURIComponent(cap.reason)}` as Route);
  }
  const { format, config } = parseConfig(formData);
  let bracketId: string;
  try {
    const res = await handlers.createStandaloneBracket.execute(
      new CreateStandaloneBracketCommand(user.id, format, config),
    );
    bracketId = res.bracketId;
  } catch (err) {
    const { code, msg } = classify(err);
    // No bracket id yet — bounce back to the create page with the error.
    redirect(`/brackets/new?notice=${code}&msg=${encodeURIComponent(msg)}` as Route);
  }
  revalidate(bracketId);
  redirect(`/brackets/${bracketId}` as Route);
}

export async function seedStandaloneFromForm(bracketId: string, formData: FormData): Promise<void> {
  const { user } = await requireRealUser();
  const entryIds = formData
    .getAll('entry_id')
    .map((v) => String(v))
    .filter((v) => v.length > 0);
  try {
    await handlers.seedStandaloneBracket.execute(
      new SeedStandaloneBracketCommand(bracketId, user.id, entryIds),
    );
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(bracketId);
    back(bracketId, code, msg);
  }
  revalidate(bracketId);
  back(bracketId, 'seeded');
}

export async function randomizeStandaloneSeedFromForm(
  bracketId: string,
  formData: FormData,
): Promise<void> {
  const ids = formData.getAll('entry_id').map((v) => String(v));
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = ids[i] as string;
    const b = ids[j] as string;
    ids[i] = b;
    ids[j] = a;
  }
  const out = new FormData();
  for (const id of ids) out.append('entry_id', id);
  await seedStandaloneFromForm(bracketId, out);
}

export async function generateStandaloneBracket(bracketId: string): Promise<void> {
  const { user } = await requireRealUser();
  try {
    await handlers.generateStandaloneBracket.execute(
      new GenerateStandaloneBracketCommand(bracketId, user.id),
    );
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(bracketId);
    back(bracketId, code, msg);
  }
  revalidate(bracketId);
  back(bracketId, 'generated');
}

export async function generateStandalonePlayoff(bracketId: string): Promise<void> {
  const { user } = await requireRealUser();
  try {
    await handlers.generateStandalonePlayoff.execute(
      new GenerateStandalonePlayoffCommand(bracketId, user.id),
    );
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(bracketId);
    back(bracketId, code, msg);
  }
  revalidate(bracketId);
  back(bracketId, 'playoff_generated');
}

export async function resetStandaloneBracket(bracketId: string): Promise<void> {
  const { user } = await requireRealUser();
  try {
    await handlers.resetStandaloneBracket.execute(
      new ResetStandaloneBracketCommand(bracketId, user.id),
    );
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(bracketId);
    back(bracketId, code, msg);
  }
  revalidate(bracketId);
  back(bracketId, 'reset');
}

export async function moveStandalonePoolMatchFromForm(
  bracketId: string,
  pool: string,
  formData: FormData,
): Promise<void> {
  const { user } = await requireRealUser();
  const moveId = String(formData.get('move_id') ?? '');
  const direction = String(formData.get('direction') ?? '');
  const order = formData.getAll('match_id').map((v) => String(v));
  if (!moveId || (direction !== 'up' && direction !== 'down') || order.length < 2) {
    revalidate(bracketId);
    back(bracketId, 'invalid', 'Bad reorder request.');
  }
  const idx = order.indexOf(moveId);
  if (idx === -1) {
    revalidate(bracketId);
    back(bracketId, 'invalid', 'Match not in pool order.');
  }
  const swapWith = direction === 'up' ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= order.length) {
    revalidate(bracketId);
    return;
  }
  const next = order.slice();
  [next[idx], next[swapWith]] = [next[swapWith]!, next[idx]!];
  try {
    await handlers.reorderStandalonePoolMatches.execute(
      new ReorderStandalonePoolMatchesCommand(bracketId, user.id, pool, next),
    );
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(bracketId);
    back(bracketId, code, msg);
  }
  revalidate(bracketId);
}

export async function recordStandaloneMatchResultFromForm(
  bracketId: string,
  matchId: string,
  formData: FormData,
): Promise<void> {
  const { user } = await requireRealUser();
  const sets: MatchSet[] = [];
  let n = 1;
  while (true) {
    const a = formData.get(`set_a_${n}`);
    const b = formData.get(`set_b_${n}`);
    if (a === null && b === null) break;
    const aStr = String(a ?? '').trim();
    const bStr = String(b ?? '').trim();
    if (aStr === '' && bStr === '') {
      n += 1;
      continue;
    }
    const aNum = Number(aStr);
    const bNum = Number(bStr);
    if (!Number.isFinite(aNum) || !Number.isFinite(bNum) || aNum < 0 || bNum < 0) {
      back(bracketId, 'invalid', `Set ${n} scores must be non-negative numbers.`);
    }
    sets.push({ setNumber: sets.length + 1, teamAScore: aNum, teamBScore: bNum });
    n += 1;
  }
  try {
    const matchHandlers = await getMatchResultHandlers();
    await matchHandlers.recordMatchResult.execute(
      new RecordMatchResultCommand(matchId, user.id, sets),
    );
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(bracketId);
    back(bracketId, code, msg);
  }
  revalidate(bracketId);
  back(bracketId, 'result_saved');
}

export async function resetStandaloneMatch(bracketId: string, matchId: string): Promise<void> {
  const { user } = await requireRealUser();
  try {
    const matchHandlers = await getMatchResultHandlers();
    await matchHandlers.resetMatch.execute(new ResetMatchCommand(matchId, user.id));
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(bracketId);
    back(bracketId, code, msg);
  }
  revalidate(bracketId);
  back(bracketId, 'match_reset');
}

/**
 * Client-invoked (from the add-team modal inside `useTransition`). Returns a
 * typed result instead of redirecting so the modal can stay open across adds,
 * mirroring the event-path `addWalkInTeam`. Standalone teams are typed-in
 * names only (no roster).
 */
export async function addBracketTeamFromClient(
  bracketId: string,
  name: string,
): Promise<{ ok: true; id: string; name: string } | { ok: false; code: string; message: string }> {
  const { user } = await requireRealUser();
  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, code: 'team_name_required', message: 'Team name is required.' };
  }
  try {
    const { entryId } = await handlers.addBracketTeam.execute(
      new AddBracketTeamCommand(bracketId, user.id, trimmed),
    );
    revalidate(bracketId);
    return { ok: true, id: entryId, name: trimmed };
  } catch (err) {
    const { code, msg } = classify(err);
    return { ok: false, code, message: msg };
  }
}
