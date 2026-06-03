'use server';

import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  AddLeagueScheduleMatchCommand,
  RecordLeagueMatchResultCommand,
  RemoveLeagueScheduleMatchCommand,
  UpdateLeagueScheduleMatchCommand,
} from '@pickupvb/application';
import {
  ConflictError,
  InvariantViolation,
  LeagueMatchStatus,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@pickupvb/domain';
import { getMatchResultHandlers, handlers } from '@/lib/handlers';
import { requireRealUser } from '@/lib/server-auth';
import { field, fieldOrUndefined } from '@/lib/form-data';

/**
 * Server actions for the per-division league schedule. Mirror the
 * bracket action conventions: host-only mutators throw typed
 * `DomainError`s in the handler, which classify into a notice code in
 * a flash-param redirect. Score recording also runs through here but
 * relies on Postgres RLS for the "host OR either captain" predicate
 * (see `RecordLeagueMatchResultHandler`).
 */

const path = (eventId: string, divisionId: string, notice: string, msg?: string): Route => {
  const params = new URLSearchParams({ division: divisionId, notice });
  if (msg) params.set('msg', msg);
  return `/events/${eventId}/schedule?${params.toString()}` as Route;
};

function back(eventId: string, divisionId: string, notice: string, msg?: string): never {
  redirect(path(eventId, divisionId, notice, msg));
}

function revalidate(eventId: string): void {
  revalidatePath(`/events/${eventId}/schedule`);
}

function classify(err: unknown): { code: string; msg: string } {
  if (err instanceof UnauthorizedError) return { code: 'forbidden', msg: err.message };
  if (err instanceof ConflictError) return { code: 'conflict', msg: err.message };
  if (err instanceof NotFoundError) return { code: 'notfound', msg: err.message };
  if (err instanceof InvariantViolation) return { code: 'invalid', msg: err.message };
  if (err instanceof ValidationError) return { code: 'invalid', msg: err.message };
  return { code: 'error', msg: err instanceof Error ? err.message : String(err) };
}

function parseScheduledAt(raw: string | undefined): Date | null {
  if (!raw) return null;
  // `<input type="datetime-local">` produces `YYYY-MM-DDTHH:mm`. We treat
  // the value as the host's local clock and let JS construct a Date in the
  // server's TZ. Converting against the event's time zone is a follow-up;
  // for now hosts see what they typed echoed back via `<LocalDateTime>`.
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

function parseScoreOrNull(raw: string | undefined): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function parseStatus(raw: string | undefined): LeagueMatchStatus | undefined {
  switch (raw) {
    case 'scheduled':
      return LeagueMatchStatus.Scheduled;
    case 'in_progress':
      return LeagueMatchStatus.InProgress;
    case 'completed':
      return LeagueMatchStatus.Completed;
    case 'forfeit':
      return LeagueMatchStatus.Forfeit;
    case 'cancelled':
      return LeagueMatchStatus.Cancelled;
    default:
      return undefined;
  }
}

function entryId(formData: FormData, name: string): string | null {
  const v = fieldOrUndefined(formData, name);
  return v && v !== 'tbd' ? v : null;
}

function matchInputFromForm(formData: FormData):
  | {
      weekNumber: number;
      scheduledAt: Date;
      courtLabel: string | null;
      homeEntryId: string | null;
      awayEntryId: string | null;
      notes: string | null;
      status?: LeagueMatchStatus;
    }
  | { error: string } {
  const week = Number(field(formData, 'week'));
  if (!Number.isInteger(week) || week < 1) return { error: 'Week must be a positive integer.' };
  const scheduledAt = parseScheduledAt(field(formData, 'scheduledAt'));
  if (!scheduledAt) return { error: 'Scheduled time is required.' };
  const status = parseStatus(fieldOrUndefined(formData, 'status'));
  return {
    weekNumber: week,
    scheduledAt,
    courtLabel: fieldOrUndefined(formData, 'courtLabel') ?? null,
    homeEntryId: entryId(formData, 'homeEntryId'),
    awayEntryId: entryId(formData, 'awayEntryId'),
    notes: fieldOrUndefined(formData, 'notes') ?? null,
    ...(status !== undefined ? { status } : {}),
  };
}

export async function addMatchFromForm(
  eventId: string,
  divisionId: string,
  returnPath: string,
  formData: FormData,
): Promise<void> {
  void returnPath;
  if (!eventId || !divisionId) return;
  const { user } = await requireRealUser();
  const parsed = matchInputFromForm(formData);
  if ('error' in parsed) {
    revalidate(eventId);
    back(eventId, divisionId, 'invalid', parsed.error);
  }
  try {
    await handlers.addLeagueScheduleMatch.execute(
      new AddLeagueScheduleMatchCommand(eventId, divisionId, user.id, parsed),
    );
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(eventId);
    back(eventId, divisionId, code, msg);
  }
  revalidate(eventId);
  back(eventId, divisionId, 'added');
}

export async function updateMatchFromForm(
  eventId: string,
  divisionId: string,
  matchId: string,
  returnPath: string,
  formData: FormData,
): Promise<void> {
  void returnPath;
  if (!eventId || !divisionId || !matchId) return;
  const { user } = await requireRealUser();
  const parsed = matchInputFromForm(formData);
  if ('error' in parsed) {
    revalidate(eventId);
    back(eventId, divisionId, 'invalid', parsed.error);
  }
  // Update form intentionally omits scores so the captain-driven scores
  // survive metadata edits. Score changes use `recordResultFromForm`.
  try {
    await handlers.updateLeagueScheduleMatch.execute(
      new UpdateLeagueScheduleMatchCommand(eventId, divisionId, matchId, user.id, parsed),
    );
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(eventId);
    back(eventId, divisionId, code, msg);
  }
  revalidate(eventId);
  back(eventId, divisionId, 'updated');
}

export async function removeMatch(
  eventId: string,
  divisionId: string,
  matchId: string,
  returnPath: string,
): Promise<void> {
  void returnPath;
  if (!eventId || !divisionId || !matchId) return;
  const { user } = await requireRealUser();
  try {
    await handlers.removeLeagueScheduleMatch.execute(
      new RemoveLeagueScheduleMatchCommand(eventId, divisionId, matchId, user.id),
    );
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(eventId);
    back(eventId, divisionId, code, msg);
  }
  revalidate(eventId);
  back(eventId, divisionId, 'removed');
}

export async function recordResultFromForm(
  eventId: string,
  divisionId: string,
  matchId: string,
  returnPath: string,
  formData: FormData,
): Promise<void> {
  void returnPath;
  if (!eventId || !divisionId || !matchId) return;
  const { user } = await requireRealUser();
  const home = parseScoreOrNull(field(formData, 'homeScore'));
  const away = parseScoreOrNull(field(formData, 'awayScore'));
  if (home === undefined || home === null || away === undefined || away === null) {
    revalidate(eventId);
    back(eventId, divisionId, 'invalid', 'Both scores are required.');
  }
  const status = parseStatus(fieldOrUndefined(formData, 'status')) ?? LeagueMatchStatus.Completed;
  try {
    // User-scoped handler: the `record_league_match_result` RPC behind it is
    // a single-row UPDATE gated by the `league_schedule_matches_update` RLS
    // policy (host or either captain). See getMatchResultHandlers /
    // docs/audits/event-data-model.md.
    const matchHandlers = await getMatchResultHandlers();
    await matchHandlers.recordLeagueMatchResult.execute(
      new RecordLeagueMatchResultCommand(
        divisionId,
        matchId,
        user.id,
        home as number,
        away as number,
        status,
      ),
    );
  } catch (err) {
    const { code, msg } = classify(err);
    revalidate(eventId);
    back(eventId, divisionId, code, msg);
  }
  revalidate(eventId);
  back(eventId, divisionId, 'recorded');
}
