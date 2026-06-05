'use server';

import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  AddBracketTeamCommand,
  AddBracketTeamsCommand,
  AddStandaloneMatchCommand,
  CreateStandaloneBracketCommand,
  DeleteStandaloneBracketCommand,
  EditStandaloneMatchCommand,
  GenerateStandaloneBracketCommand,
  GenerateStandalonePlayoffCommand,
  PublishStandaloneBracketCommand,
  RecordMatchResultCommand,
  RemoveStandaloneMatchCommand,
  ReopenStandaloneBracketCommand,
  ReorderStandalonePoolMatchesCommand,
  ReplaceStandaloneEntryCommand,
  ResetStandaloneBracketCommand,
  ResetMatchCommand,
  SeedStandaloneBracketCommand,
  SetStandalonePoolsCommand,
  type AddMatchInputDto,
  type EditMatchPatchInput,
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
  const targetScore = Number(formData.get('target_score') ?? '');
  if (Number.isInteger(targetScore) && targetScore >= 1) config.targetScore = targetScore;
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
    const playoffBestOf = Number(formData.get('playoff_best_of') ?? '');
    if (playoffBestOf === 1 || playoffBestOf === 3 || playoffBestOf === 5) {
      config.playoffBestOf = playoffBestOf;
    }
    const playoffTarget = Number(formData.get('playoff_target_score') ?? '');
    if (Number.isInteger(playoffTarget) && playoffTarget >= 1) {
      config.playoffTargetScore = playoffTarget;
    }
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

/** Re-open a completed standalone bracket so the owner can fix a result (TT-10). */
export async function reopenStandaloneBracket(bracketId: string): Promise<void> {
  const { user } = await requireRealUser();
  try {
    await handlers.reopenStandaloneBracket.execute(
      new ReopenStandaloneBracketCommand(bracketId, user.id),
    );
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(bracketId);
    back(bracketId, code, msg);
  }
  revalidate(bracketId);
  back(bracketId, 'reopened');
}

// ---- Draft + live structural edits (ADR 0032 / TT-11) ---------------------
//
// Standalone twins of the event-path draft workspace + live-board edits. All
// owner-gated in their handlers; plain flash-param redirects like the actions
// above. Parsing mirrors the event `*FromForm` actions field-for-field.

/** Publish a draft standalone bracket → live. */
export async function publishStandaloneBracket(bracketId: string): Promise<void> {
  const { user } = await requireRealUser();
  try {
    await handlers.publishStandaloneBracket.execute(
      new PublishStandaloneBracketCommand(bracketId, user.id),
    );
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(bracketId);
    back(bracketId, code, msg);
  }
  revalidate(bracketId);
  back(bracketId, 'published');
}

/** Patch one match (matchup / court / length). Mirrors editBracketMatchFromForm. */
export async function editStandaloneMatchFromForm(
  bracketId: string,
  matchId: string,
  formData: FormData,
): Promise<void> {
  const { user } = await requireRealUser();
  const patch: EditMatchPatchInput = {};
  const a = formData.get('entry_a');
  if (a !== null) patch.entryAId = a === '' || a === 'tbd' ? null : String(a);
  const b = formData.get('entry_b');
  if (b !== null) patch.entryBId = b === '' || b === 'tbd' ? null : String(b);
  const court = formData.get('court');
  if (court !== null) patch.court = String(court).trim() || null;
  const bo = Number(formData.get('best_of') ?? '');
  patch.bestOf = bo === 1 || bo === 3 || bo === 5 ? bo : null;
  const ts = Number(formData.get('target_score') ?? '');
  patch.targetScore = Number.isInteger(ts) && ts >= 1 ? ts : null;
  try {
    await handlers.editStandaloneMatch.execute(
      new EditStandaloneMatchCommand(bracketId, user.id, matchId, patch),
    );
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(bracketId);
    back(bracketId, code, msg);
  }
  revalidate(bracketId);
  back(bracketId, 'match_updated');
}

/** Append a match to a pool (or the open stage). */
export async function addStandaloneMatchFromForm(
  bracketId: string,
  formData: FormData,
): Promise<void> {
  const { user } = await requireRealUser();
  const input: AddMatchInputDto = {};
  const pool = String(formData.get('pool') ?? '').trim();
  if (pool) input.pool = pool;
  const a = formData.get('entry_a');
  if (a !== null && a !== '' && a !== 'tbd') input.entryAId = String(a);
  const b = formData.get('entry_b');
  if (b !== null && b !== '' && b !== 'tbd') input.entryBId = String(b);
  try {
    await handlers.addStandaloneMatch.execute(
      new AddStandaloneMatchCommand(bracketId, user.id, input),
    );
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(bracketId);
    back(bracketId, code, msg);
  }
  revalidate(bracketId);
  back(bracketId, 'match_added');
}

/** Remove a match. */
export async function removeStandaloneBracketMatch(
  bracketId: string,
  matchId: string,
): Promise<void> {
  const { user } = await requireRealUser();
  try {
    await handlers.removeStandaloneMatch.execute(
      new RemoveStandaloneMatchCommand(bracketId, user.id, matchId),
    );
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(bracketId);
    back(bracketId, code, msg);
  }
  revalidate(bracketId);
  back(bracketId, 'match_removed');
}

/**
 * Reassign teams to pools in bulk, then rebuild the pool schedule from the new
 * composition (stays in draft). Mirrors setBracketPoolsFromForm.
 */
export async function setStandalonePoolsFromForm(
  bracketId: string,
  formData: FormData,
): Promise<void> {
  const { user } = await requireRealUser();
  const assignments: Array<{ entryId: string; pool: string | null }> = [];
  for (const [key, val] of formData.entries()) {
    if (!key.startsWith('team_pool_')) continue;
    const entryId = key.slice('team_pool_'.length);
    const pool = String(val).trim();
    assignments.push({ entryId, pool: pool || null });
  }
  if (assignments.length === 0) {
    revalidate(bracketId);
    back(bracketId, 'invalid', 'No pool assignments submitted.');
  }
  try {
    await handlers.setStandalonePools.execute(
      new SetStandalonePoolsCommand(bracketId, user.id, assignments),
    );
    await handlers.generateStandaloneBracket.execute(
      new GenerateStandaloneBracketCommand(bracketId, user.id),
    );
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(bracketId);
    back(bracketId, code, msg);
  }
  revalidate(bracketId);
  back(bracketId, 'pools_updated');
}

/** Substitute one entry for another everywhere it appears in the bracket. */
export async function replaceStandaloneEntryFromForm(
  bracketId: string,
  formData: FormData,
): Promise<void> {
  const { user } = await requireRealUser();
  const oldEntryId = String(formData.get('old_entry_id') ?? '');
  const newEntryId = String(formData.get('new_entry_id') ?? '');
  if (!oldEntryId || !newEntryId || oldEntryId === newEntryId) {
    revalidate(bracketId);
    back(bracketId, 'invalid', 'Pick two different teams to substitute.');
  }
  try {
    await handlers.replaceStandaloneEntry.execute(
      new ReplaceStandaloneEntryCommand(bracketId, user.id, oldEntryId, newEntryId),
    );
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(bracketId);
    back(bracketId, code, msg);
  }
  revalidate(bracketId);
  back(bracketId, 'entry_replaced');
}

/**
 * Permanently delete a standalone bracket (TT-12). On success there's no
 * bracket to return to, so redirect to the "My brackets" list; the deleted row
 * frees the free-tier active-bracket slot. Owner-gated in the handler.
 */
export async function deleteStandaloneBracket(bracketId: string): Promise<void> {
  const { user } = await requireRealUser();
  try {
    await handlers.deleteStandaloneBracket.execute(
      new DeleteStandaloneBracketCommand(bracketId, user.id),
    );
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(bracketId);
    back(bracketId, code, msg);
  }
  revalidatePath('/brackets');
  redirect('/brackets' as Route);
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

/**
 * Client-invoked bulk add (from the "paste a list" tab of the add-team modal,
 * inside `useTransition`). Adds every non-blank name in one round-trip and
 * returns the created entries so the modal can fold them into its "added this
 * session" list. Like {@link addBracketTeamFromClient} it returns a typed
 * result instead of redirecting so the modal stays open across batches.
 */
export async function addBracketTeamsFromClient(
  bracketId: string,
  names: ReadonlyArray<string>,
): Promise<
  | { ok: true; added: Array<{ id: string; name: string }> }
  | { ok: false; code: string; message: string }
> {
  const { user } = await requireRealUser();
  try {
    const added = await handlers.addBracketTeams.execute(
      new AddBracketTeamsCommand(bracketId, user.id, names),
    );
    revalidate(bracketId);
    return { ok: true, added: added.map((t) => ({ id: t.entryId, name: t.name })) };
  } catch (err) {
    const { code, msg } = classify(err);
    return { ok: false, code, message: msg };
  }
}
