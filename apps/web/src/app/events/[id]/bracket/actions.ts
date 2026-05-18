'use server';

import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  CreateBracketCommand,
  GenerateBracketCommand,
  GeneratePlayoffCommand,
  RecordMatchResultCommand,
  ResetBracketCommand,
  ResetMatchCommand,
  SeedBracketCommand,
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
import { handlers } from '@/lib/handlers';
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
  if (format === 'pool_play_playoff') {
    const poolCount = Number(formData.get('pool_count') ?? '');
    const advance = Number(formData.get('advance_per_pool') ?? '');
    if (Number.isFinite(poolCount) && poolCount >= 2) config.poolCount = poolCount;
    if (Number.isFinite(advance) && advance >= 1) config.advancePerPool = advance;
  }
  await createBracket(
    eventId,
    divisionId,
    format,
    Object.keys(config).length > 0 ? config : undefined,
  );
}

/**
 * Reseed: the form posts hidden `team_id` inputs in the desired order.
 */
export async function seedBracketFromForm(
  eventId: string,
  divisionId: string,
  formData: FormData,
): Promise<void> {
  const { user } = await requireRealUser();
  const teamIds = formData
    .getAll('team_id')
    .map((v) => String(v))
    .filter((v) => v.length > 0);
  try {
    await handlers.seedBracket.execute(new SeedBracketCommand(divisionId, user.id, teamIds));
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
  const ids = formData.getAll('team_id').map((v) => String(v));
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = ids[i] as string;
    const b = ids[j] as string;
    ids[i] = b;
    ids[j] = a;
  }
  const out = new FormData();
  for (const id of ids) out.append('team_id', id);
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
  await requireRealUser();
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
    await handlers.recordMatchResult.execute(new RecordMatchResultCommand(matchId, '', sets));
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
  await requireRealUser();
  try {
    await handlers.resetMatch.execute(new ResetMatchCommand(matchId, ''));
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(eventId);
    back(eventId, divisionId, code, msg);
  }
  revalidate(eventId);
  back(eventId, divisionId, 'match_reset');
}
