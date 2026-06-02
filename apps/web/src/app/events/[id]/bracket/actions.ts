'use server';

import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  AddMatchCommand,
  CreateBracketCommand,
  EditMatchCommand,
  GenerateBracketCommand,
  GeneratePlayoffCommand,
  PublishBracketCommand,
  RecordMatchResultCommand,
  RegisterAdHocTeamCommand,
  RemoveMatchCommand,
  ReopenBracketCommand,
  ReorderPoolMatchesCommand,
  ReplaceEntryCommand,
  ResetBracketCommand,
  ResetMatchCommand,
  SeedBracketCommand,
  SetPoolsCommand,
  type EditMatchPatchInput,
  type AddMatchInputDto,
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

/**
 * Server actions for the bracket page. Host-only mutations (create, seed,
 * generate, reset, reset-match) are guarded inside the handler. Result
 * recording is permitted for hosts/co-hosts and either team's captain;
 * RLS at the DB layer is the second line of defense.
 *
 * Every redirect target preserves the active division via `?division=`,
 * so the page lands on the correct division tab and can flash a status
 * banner via `?notice=…`.
 *
 * Action signatures are `(eventId, divisionId, ...)` so the call site only
 * needs to bind once (the page knows both).
 */

const path = (eventId: string, divisionId: string, notice: string, msg?: string): string => {
  const params = new URLSearchParams({ division: divisionId, notice });
  if (msg) params.set('msg', msg);
  return `/events/${eventId}/bracket?${params.toString()}`;
};

function back(eventId: string, divisionId: string, notice: string, msg?: string): never {
  redirect(path(eventId, divisionId, notice, msg) as Route);
}

function revalidate(eventId: string): void {
  revalidatePath(`/events/${eventId}/bracket`);
}

function classify(err: unknown): { code: string; msg: string } {
  if (err instanceof UnauthorizedError) return { code: 'forbidden', msg: err.message };
  if (err instanceof ConflictError) return { code: 'conflict', msg: err.message };
  if (err instanceof NotFoundError) return { code: 'notfound', msg: err.message };
  if (err instanceof InvariantViolation) return { code: 'invalid', msg: err.message };
  if (err instanceof ValidationError) return { code: 'invalid', msg: err.message };
  return { code: 'error', msg: err instanceof Error ? err.message : String(err) };
}

export async function createBracket(
  eventId: string,
  divisionId: string,
  format: BracketFormat,
  config?: Partial<BracketConfig>,
): Promise<void> {
  const { user } = await requireRealUser();
  try {
    await handlers.createBracket.execute(
      new CreateBracketCommand(eventId, divisionId, user.id, format, config),
    );
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(eventId);
    back(eventId, divisionId, code, msg);
  }
  revalidate(eventId);
  back(eventId, divisionId, 'created');
}

/** Bound at the call site: `createBracketFromForm.bind(null, eventId, divisionId)`. */
export async function createBracketFromForm(
  eventId: string,
  divisionId: string,
  formData: FormData,
): Promise<void> {
  const format = String(formData.get('format') ?? 'single_elimination') as BracketFormat;
  const config: Partial<BracketConfig> = {};
  const bestOf = Number(formData.get('best_of') ?? '');
  if (bestOf === 1 || bestOf === 3 || bestOf === 5) config.bestOf = bestOf;
  // Target score (ADR 0032) — points a game is played to; informational. Applies
  // to every format. Empty / non-positive leaves it unset (null default).
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
    // Playoff-stage length overrides (ADR 0032). Empty ⇒ unset (falls back to
    // the pool-play bestOf / targetScore at scoring time).
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
    // Per-pool overrides: any field named `pool_courts_<LABEL>` becomes
    // an entry in courtsByPool. Empty string is treated as "no entry"
    // (fall back to bracket-wide list) — to explicitly opt a pool out,
    // the host would need future UI; we keep the form simple for now.
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
  await createBracket(
    eventId,
    divisionId,
    format,
    Object.keys(config).length > 0 ? config : undefined,
  );
}

/**
 * Reseed: the form posts hidden `entry_id` inputs in the desired order.
 */
export async function seedBracketFromForm(
  eventId: string,
  divisionId: string,
  formData: FormData,
): Promise<void> {
  const { user } = await requireRealUser();
  const entryIds = formData
    .getAll('entry_id')
    .map((v) => String(v))
    .filter((v) => v.length > 0);
  try {
    await handlers.seedBracket.execute(new SeedBracketCommand(divisionId, user.id, entryIds));
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(eventId);
    back(eventId, divisionId, code, msg);
  }
  revalidate(eventId);
  back(eventId, divisionId, 'seeded');
}

/**
 * Same as `seedBracketFromForm` but shuffles the team order before saving.
 * Lets the host hit a single button to randomize seeding.
 */
export async function randomizeSeedFromForm(
  eventId: string,
  divisionId: string,
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
  await seedBracketFromForm(eventId, divisionId, out);
}

export async function generateBracket(eventId: string, divisionId: string): Promise<void> {
  const { user } = await requireRealUser();
  try {
    await handlers.generateBracket.execute(new GenerateBracketCommand(divisionId, user.id));
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(eventId);
    back(eventId, divisionId, code, msg);
  }
  revalidate(eventId);
  back(eventId, divisionId, 'generated');
}

export async function generatePlayoff(eventId: string, divisionId: string): Promise<void> {
  const { user } = await requireRealUser();
  try {
    await handlers.generatePlayoff.execute(new GeneratePlayoffCommand(divisionId, user.id));
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(eventId);
    back(eventId, divisionId, code, msg);
  }
  revalidate(eventId);
  back(eventId, divisionId, 'playoff_generated');
}

export async function resetBracket(eventId: string, divisionId: string): Promise<void> {
  const { user } = await requireRealUser();
  try {
    await handlers.resetBracket.execute(new ResetBracketCommand(divisionId, user.id));
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(eventId);
    back(eventId, divisionId, code, msg);
  }
  revalidate(eventId);
  back(eventId, divisionId, 'reset');
}

// ---- Draft editing (ADR 0032) ---------------------------------------------
//
// Host-gated structural edits to a `draft` bracket. All flash-param redirects
// (the draft workspace renders plain `<form action>` submits), so they mirror
// the generate/seed/reset actions above.

/** Publish a draft → live. */
export async function publishBracket(eventId: string, divisionId: string): Promise<void> {
  const { user } = await requireRealUser();
  try {
    await handlers.publishBracket.execute(new PublishBracketCommand(divisionId, user.id));
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(eventId);
    back(eventId, divisionId, code, msg);
  }
  revalidate(eventId);
  back(eventId, divisionId, 'published');
}

/**
 * Patch one match. The form always submits every field, so each is applied
 * (empty / "tbd" clears the override or the team). See EditMatchCommand.
 */
export async function editBracketMatchFromForm(
  eventId: string,
  divisionId: string,
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
    await handlers.editBracketMatch.execute(
      new EditMatchCommand(divisionId, user.id, matchId, patch),
    );
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(eventId);
    back(eventId, divisionId, code, msg);
  }
  revalidate(eventId);
  back(eventId, divisionId, 'match_updated');
}

/** Append a match to a pool (or the open stage). */
export async function addBracketMatchFromForm(
  eventId: string,
  divisionId: string,
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
    await handlers.addBracketMatch.execute(new AddMatchCommand(divisionId, user.id, input));
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(eventId);
    back(eventId, divisionId, code, msg);
  }
  revalidate(eventId);
  back(eventId, divisionId, 'match_added');
}

/** Remove a match. */
export async function removeBracketMatch(
  eventId: string,
  divisionId: string,
  matchId: string,
): Promise<void> {
  const { user } = await requireRealUser();
  try {
    await handlers.removeBracketMatch.execute(new RemoveMatchCommand(divisionId, user.id, matchId));
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(eventId);
    back(eventId, divisionId, code, msg);
  }
  revalidate(eventId);
  back(eventId, divisionId, 'match_removed');
}

/**
 * Reassign teams to pools in bulk (one `team_pool_<entryId>` field per team),
 * then rebuild the pool schedule from the new composition (setPools is
 * labels-only; generate re-derives the matches — ADR 0032). Stays in draft.
 * Rebuilding discards any manual schedule edits, which is expected when the
 * pool composition changes.
 */
export async function setBracketPoolsFromForm(
  eventId: string,
  divisionId: string,
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
    revalidate(eventId);
    back(eventId, divisionId, 'invalid', 'No pool assignments submitted.');
  }
  try {
    await handlers.setBracketPools.execute(new SetPoolsCommand(divisionId, user.id, assignments));
    await handlers.generateBracket.execute(new GenerateBracketCommand(divisionId, user.id));
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(eventId);
    back(eventId, divisionId, code, msg);
  }
  revalidate(eventId);
  back(eventId, divisionId, 'pools_updated');
}

// ---- Live-board edits (ADR 0032 / Phase 5) --------------------------------

/** Re-open a completed bracket so the host can fix a result. */
export async function reopenBracket(eventId: string, divisionId: string): Promise<void> {
  const { user } = await requireRealUser();
  try {
    await handlers.reopenBracket.execute(new ReopenBracketCommand(divisionId, user.id));
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(eventId);
    back(eventId, divisionId, code, msg);
  }
  revalidate(eventId);
  back(eventId, divisionId, 'reopened');
}

/**
 * Substitute one entry for another everywhere it appears in the bracket — a
 * dropped team replaced by a registered stand-in. See ReplaceEntryCommand.
 */
export async function replaceEntryFromForm(
  eventId: string,
  divisionId: string,
  formData: FormData,
): Promise<void> {
  const { user } = await requireRealUser();
  const oldEntryId = String(formData.get('old_entry_id') ?? '');
  const newEntryId = String(formData.get('new_entry_id') ?? '');
  if (!oldEntryId || !newEntryId || oldEntryId === newEntryId) {
    revalidate(eventId);
    back(eventId, divisionId, 'invalid', 'Pick two different teams to substitute.');
  }
  try {
    await handlers.replaceBracketEntry.execute(
      new ReplaceEntryCommand(divisionId, user.id, oldEntryId, newEntryId),
    );
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(eventId);
    back(eventId, divisionId, code, msg);
  }
  revalidate(eventId);
  back(eventId, divisionId, 'entry_replaced');
}

/**
 * Bump a pool-play match up or down by one position. The form posts the
 * pool's current match order via repeated hidden `match_id` inputs plus
 * the `move_id` and `direction` of the button clicked. The server
 * computes the new order and hands it to the aggregate. See ADR 0018
 * Phase 1b.
 */
export async function movePoolMatchFromForm(
  eventId: string,
  divisionId: string,
  pool: string,
  formData: FormData,
): Promise<void> {
  const { user } = await requireRealUser();
  const moveId = String(formData.get('move_id') ?? '');
  const direction = String(formData.get('direction') ?? '');
  const order = formData.getAll('match_id').map((v) => String(v));
  if (!moveId || (direction !== 'up' && direction !== 'down') || order.length < 2) {
    revalidate(eventId);
    back(eventId, divisionId, 'invalid', 'Bad reorder request.');
  }
  const idx = order.indexOf(moveId);
  if (idx === -1) {
    revalidate(eventId);
    back(eventId, divisionId, 'invalid', 'Match not in pool order.');
  }
  const swapWith = direction === 'up' ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= order.length) {
    // Already at the edge — no-op.
    revalidate(eventId);
    return;
  }
  const next = order.slice();
  [next[idx], next[swapWith]] = [next[swapWith]!, next[idx]!];
  try {
    await handlers.reorderPoolMatches.execute(
      new ReorderPoolMatchesCommand(divisionId, user.id, pool, next),
    );
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(eventId);
    back(eventId, divisionId, code, msg);
  }
  revalidate(eventId);
}

/**
 * Result entry. The form encodes set scores as paired `set_a_<n>` /
 * `set_b_<n>` fields starting at 1; empty pairs are dropped. Any pair
 * with one side filled but not the other is rejected as invalid.
 */
export async function recordMatchResultFromForm(
  eventId: string,
  divisionId: string,
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
      back(eventId, divisionId, 'invalid', `Set ${n} scores must be non-negative numbers.`);
    }
    sets.push({ setNumber: sets.length + 1, teamAScore: aNum, teamBScore: bNum });
    n += 1;
  }
  try {
    // User-scoped handler: the `record_bracket_match_result` RPC behind it
    // authorizes the write against `auth.uid()` (host or captain of this
    // match). See getMatchResultHandlers / docs/audits/event-data-model.md.
    const matchHandlers = await getMatchResultHandlers();
    await matchHandlers.recordMatchResult.execute(
      new RecordMatchResultCommand(matchId, user.id, sets),
    );
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(eventId);
    back(eventId, divisionId, code, msg);
  }
  revalidate(eventId);
  revalidatePath(`/events/${eventId}`);
  back(eventId, divisionId, 'result_saved');
}

export async function resetMatch(
  eventId: string,
  divisionId: string,
  matchId: string,
): Promise<void> {
  const { user } = await requireRealUser();
  try {
    const matchHandlers = await getMatchResultHandlers();
    await matchHandlers.resetMatch.execute(new ResetMatchCommand(matchId, user.id));
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(eventId);
    back(eventId, divisionId, code, msg);
  }
  revalidate(eventId);
  back(eventId, divisionId, 'match_reset');
}

/**
 * Host-only escape hatch for adding walk-in / unregistered teams directly
 * to a division's bracket. Reuses the ad-hoc registration pipeline
 * (ADR 0007) so each new row participates in seeding, capacity accounting,
 * and audit history the same as any other team. The acting host becomes the
 * nominal captain — they can rename or reassign the roster later from the
 * event's team management UI.
 *
 * Unlike the other actions in this file this one is invoked **from the
 * client**: the walk-in modal calls it inside `useTransition` so the host
 * can add several teams without the modal closing between each. Per the
 * AGENTS.md server-action convention for client-invoked actions it therefore
 * returns a typed result instead of `redirect()`-ing — the modal branches on
 * `ok`, appends the team to its running list, clears the fields, and stays
 * open. `revalidatePath` still runs on success so the bracket page (team
 * count, seeding list) refreshes underneath the open modal.
 *
 * `members` carries the optional starting roster; rows with a blank name are
 * dropped so the host can leave extras empty without effect.
 */
export async function addWalkInTeam(
  eventId: string,
  divisionId: string,
  input: { name: string; members: ReadonlyArray<{ displayName: string; email?: string }> },
): Promise<{ ok: true; id: string; name: string } | { ok: false; code: string; message: string }> {
  const { user } = await requireRealUser();
  const name = input.name.trim();
  if (!name) {
    return { ok: false, code: 'team_name_required', message: 'Team name is required.' };
  }
  const members = input.members
    .map((m) => ({ displayName: m.displayName.trim(), email: (m.email ?? '').trim() }))
    .filter((m) => m.displayName.length > 0)
    .map((m) =>
      m.email ? { displayName: m.displayName, email: m.email } : { displayName: m.displayName },
    );

  try {
    const { id } = await handlers.registerAdHocTeam.execute(
      new RegisterAdHocTeamCommand(eventId, divisionId, user.id, name, members, true),
    );
    revalidate(eventId);
    return { ok: true, id, name };
  } catch (err) {
    const { code, msg } = classify(err);
    return { ok: false, code, message: msg };
  }
}
