import { idConstructor, type Brand } from '../shared/brand.js';
import { AggregateRoot } from '../shared/aggregate-root.js';
import { ConflictError, InvariantViolation, NotFoundError } from '../shared/result.js';
import type { DivisionId } from '../events/division.js';
import type { EntryId } from '../brackets/match.js';

export type LeagueScheduleMatchId = Brand<string, 'LeagueScheduleMatchId'>;
export const LeagueScheduleMatchId = idConstructor<'LeagueScheduleMatchId'>();

export const LeagueMatchStatus = {
  Scheduled: 'scheduled',
  InProgress: 'in_progress',
  Completed: 'completed',
  Forfeit: 'forfeit',
  Cancelled: 'cancelled',
} as const;
export type LeagueMatchStatus = (typeof LeagueMatchStatus)[keyof typeof LeagueMatchStatus];

const MAX_COURT_LABEL_LEN = 40;
const MAX_NOTES_LEN = 1_000;

export interface LeagueScheduleMatchProps {
  id: LeagueScheduleMatchId;
  weekNumber: number;
  scheduledAt: Date;
  courtLabel: string | null;
  homeEntryId: EntryId | null;
  awayEntryId: EntryId | null;
  homeScore: number | null;
  awayScore: number | null;
  status: LeagueMatchStatus;
  notes: string | null;
}

/**
 * A single regular-season match inside a {@link LeagueSchedule}. Value-shaped
 * entity inside the aggregate; all mutations go through the schedule.
 */
export class LeagueScheduleMatch {
  private constructor(
    public readonly id: LeagueScheduleMatchId,
    public readonly weekNumber: number,
    public readonly scheduledAt: Date,
    public readonly courtLabel: string | null,
    public readonly homeEntryId: EntryId | null,
    public readonly awayEntryId: EntryId | null,
    public readonly homeScore: number | null,
    public readonly awayScore: number | null,
    public readonly status: LeagueMatchStatus,
    public readonly notes: string | null,
  ) {}

  static create(props: LeagueScheduleMatchProps): LeagueScheduleMatch {
    if (!Number.isInteger(props.weekNumber) || props.weekNumber < 1) {
      throw new InvariantViolation('Match week number must be an integer ≥ 1.');
    }
    if (!(props.scheduledAt instanceof Date) || Number.isNaN(props.scheduledAt.getTime())) {
      throw new InvariantViolation('Match scheduled_at must be a valid Date.');
    }
    if (
      props.homeEntryId != null &&
      props.awayEntryId != null &&
      props.homeEntryId === props.awayEntryId
    ) {
      throw new InvariantViolation('Match home and away teams must be different.');
    }
    if (props.homeScore != null && (!Number.isInteger(props.homeScore) || props.homeScore < 0)) {
      throw new InvariantViolation('Home score must be a non-negative integer.');
    }
    if (props.awayScore != null && (!Number.isInteger(props.awayScore) || props.awayScore < 0)) {
      throw new InvariantViolation('Away score must be a non-negative integer.');
    }
    const courtLabel = props.courtLabel?.trim() || null;
    if (courtLabel && courtLabel.length > MAX_COURT_LABEL_LEN) {
      throw new InvariantViolation(
        `Court label must be at most ${MAX_COURT_LABEL_LEN} characters.`,
      );
    }
    const notes = props.notes?.trim() || null;
    if (notes && notes.length > MAX_NOTES_LEN) {
      throw new InvariantViolation(`Notes must be at most ${MAX_NOTES_LEN} characters.`);
    }

    return new LeagueScheduleMatch(
      props.id,
      props.weekNumber,
      props.scheduledAt,
      courtLabel,
      props.homeEntryId,
      props.awayEntryId,
      props.homeScore,
      props.awayScore,
      props.status,
      notes,
    );
  }
}

export interface EventWindow {
  startsAt: Date;
  endsAt: Date;
}

export interface CreateLeagueScheduleProps {
  divisionId: DivisionId;
  /**
   * The parent event's start/end window. Match scheduled_at values must
   * fall within `[startsAt, endsAt]` (inclusive). For leagues these are
   * the season start and playoff end.
   */
  eventWindow: EventWindow;
  matches?: ReadonlyArray<LeagueScheduleMatch>;
}

/**
 * Per-division league schedule. Owns the regular-season match graph
 * (week 1..N slates) and the rules for adding / scoring matches. Pure:
 * no I/O. The repository hydrates via {@link fromPersistence} and
 * persists the full match list on save.
 *
 * Identity is the division: one schedule per division (one league
 * division has exactly one regular season). The end-of-season playoff
 * bracket is a sibling {@link Bracket} keyed off the same division id —
 * leagues and brackets coexist on the same division.
 *
 * Invariants enforced here:
 *  - Every match's `weekNumber` ≥ 1.
 *  - Distinct `homeEntryId` / `awayEntryId` (when both set). The competitor
 *    identity is the `event_team_entries.id` (ADR 0034), so team-less
 *    host-added entries are schedulable.
 *  - `scheduledAt` falls inside the event window.
 *
 * Not enforced here (deferred to follow-ups / application layer):
 *  - Strict week contiguity (1..N with no gaps). The schedule today
 *    allows sparse weeks so hosts can stub future weeks before
 *    filling earlier ones in.
 *  - Team-vs-team uniqueness per week (a team could appear twice in
 *    the same week's slate). Add only if a host reports a conflict.
 */
export class LeagueSchedule extends AggregateRoot<DivisionId> {
  private constructor(
    divisionId: DivisionId,
    public readonly eventWindow: EventWindow,
    private _matches: LeagueScheduleMatch[],
  ) {
    super(divisionId);
  }

  get divisionId(): DivisionId {
    return this.id;
  }

  get matches(): ReadonlyArray<LeagueScheduleMatch> {
    return this._matches;
  }

  static create(props: CreateLeagueScheduleProps): LeagueSchedule {
    assertWindow(props.eventWindow);
    const matches = (props.matches ?? []).slice();
    for (const match of matches) {
      assertMatchInWindow(match, props.eventWindow);
    }
    assertNoDuplicateIds(matches);
    return new LeagueSchedule(props.divisionId, props.eventWindow, matches);
  }

  static fromPersistence(
    divisionId: DivisionId,
    eventWindow: EventWindow,
    matches: ReadonlyArray<LeagueScheduleMatch>,
  ): LeagueSchedule {
    return new LeagueSchedule(divisionId, eventWindow, matches.slice());
  }

  addMatch(match: LeagueScheduleMatch): void {
    assertMatchInWindow(match, this.eventWindow);
    if (this._matches.some((m) => m.id === match.id)) {
      throw new ConflictError(`League match ${match.id} already exists in this schedule.`);
    }
    this._matches.push(match);
  }

  removeMatch(matchId: LeagueScheduleMatchId): void {
    const idx = this._matches.findIndex((m) => m.id === matchId);
    if (idx === -1) {
      throw new NotFoundError('LeagueScheduleMatch', matchId);
    }
    this._matches.splice(idx, 1);
  }

  replaceMatch(match: LeagueScheduleMatch): void {
    assertMatchInWindow(match, this.eventWindow);
    const idx = this._matches.findIndex((m) => m.id === match.id);
    if (idx === -1) {
      throw new NotFoundError('LeagueScheduleMatch', match.id);
    }
    this._matches[idx] = match;
  }
}

function assertWindow(window: EventWindow): void {
  if (!(window.startsAt instanceof Date) || Number.isNaN(window.startsAt.getTime())) {
    throw new InvariantViolation('Event window startsAt must be a valid Date.');
  }
  if (!(window.endsAt instanceof Date) || Number.isNaN(window.endsAt.getTime())) {
    throw new InvariantViolation('Event window endsAt must be a valid Date.');
  }
  if (window.endsAt.getTime() < window.startsAt.getTime()) {
    throw new InvariantViolation('Event window endsAt must be on or after startsAt.');
  }
}

function assertMatchInWindow(match: LeagueScheduleMatch, window: EventWindow): void {
  const t = match.scheduledAt.getTime();
  if (t < window.startsAt.getTime() || t > window.endsAt.getTime()) {
    throw new InvariantViolation(
      `Match scheduled_at (${match.scheduledAt.toISOString()}) is outside the event window.`,
    );
  }
}

function assertNoDuplicateIds(matches: ReadonlyArray<LeagueScheduleMatch>): void {
  const seen = new Set<string>();
  for (const m of matches) {
    if (seen.has(m.id)) {
      throw new ConflictError(`Duplicate LeagueScheduleMatch id ${m.id}.`);
    }
    seen.add(m.id);
  }
}
