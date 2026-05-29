import {
  EventType,
  LeagueMatchStatus,
  LeagueScheduleMatch,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  type DivisionId,
  type EventRepository,
  type LeagueSchedule,
  type LeagueScheduleMatchId,
  type LeagueScheduleRepository,
  type TeamId,
  type VolleyballEvent,
} from '@pickupvb/domain';

// ---- Commands ------------------------------------------------------------
//
// All league-schedule commands are scoped to a single division (one
// schedule per division — leagues are pre-defined-roster per division).
// `eventId` is retained on the commands because the route boundary has
// it on hand for revalidation; it isn't trusted for authorization.

export interface ScheduleMatchInput {
  weekNumber: number;
  scheduledAt: Date;
  courtLabel?: string | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  status?: LeagueMatchStatus;
  notes?: string | null;
}

export class AddLeagueScheduleMatchCommand {
  constructor(
    public readonly eventId: string,
    public readonly divisionId: string,
    public readonly requesterId: string,
    public readonly match: ScheduleMatchInput,
  ) {}
}

export interface UpdateMatchInput extends ScheduleMatchInput {
  /**
   * When provided, replaces home/away scores. Omit to leave existing
   * scores in place. Use {@link RecordLeagueMatchResultCommand} for
   * the captain-driven score-entry flow.
   */
  homeScore?: number | null;
  awayScore?: number | null;
}

export class UpdateLeagueScheduleMatchCommand {
  constructor(
    public readonly eventId: string,
    public readonly divisionId: string,
    public readonly matchId: string,
    public readonly requesterId: string,
    public readonly match: UpdateMatchInput,
  ) {}
}

export class RemoveLeagueScheduleMatchCommand {
  constructor(
    public readonly eventId: string,
    public readonly divisionId: string,
    public readonly matchId: string,
    public readonly requesterId: string,
  ) {}
}

export class RecordLeagueMatchResultCommand {
  constructor(
    public readonly divisionId: string,
    public readonly matchId: string,
    public readonly requesterId: string,
    public readonly homeScore: number,
    public readonly awayScore: number,
    /** Defaults to `'completed'`. Pass `'forfeit'` for a forfeit. */
    public readonly status?: LeagueMatchStatus,
  ) {}
}

// ---- Helpers -------------------------------------------------------------

async function loadEventOrThrow(
  events: EventRepository,
  eventId: string,
): Promise<VolleyballEvent> {
  const evt = await events.findById(eventId);
  if (!evt) throw new NotFoundError('event', eventId);
  return evt;
}

function assertLeagueDivision(evt: VolleyballEvent, divisionId: string): void {
  if (evt.type !== EventType.League) {
    throw new ValidationError('League schedule operations only apply to league events.', {
      eventType: evt.type,
      eventId: String(evt.id),
    });
  }
  const division = evt.divisions.find((d) => String(d.id) === divisionId);
  if (!division) {
    throw new NotFoundError('division', divisionId);
  }
}

function assertHost(eventHostId: string, requesterId: string): void {
  // Co-host check happens at the route boundary (no domain port for it
  // yet); this guard catches the trivial "non-host trying to mutate".
  if (eventHostId !== requesterId) {
    throw new UnauthorizedError('Only the event host can manage the league schedule.');
  }
}

async function loadScheduleOrThrow(
  schedules: LeagueScheduleRepository,
  divisionId: string,
): Promise<LeagueSchedule> {
  const schedule = await schedules.findByDivisionId(divisionId as DivisionId);
  if (!schedule) throw new NotFoundError('division', divisionId);
  return schedule;
}

function buildMatch(
  id: LeagueScheduleMatchId,
  input: ScheduleMatchInput,
  scores?: { homeScore: number | null; awayScore: number | null },
): LeagueScheduleMatch {
  return LeagueScheduleMatch.create({
    id,
    weekNumber: input.weekNumber,
    scheduledAt: input.scheduledAt,
    courtLabel: input.courtLabel ?? null,
    homeTeamId: (input.homeTeamId ?? null) as TeamId | null,
    awayTeamId: (input.awayTeamId ?? null) as TeamId | null,
    homeScore: scores?.homeScore ?? null,
    awayScore: scores?.awayScore ?? null,
    status: input.status ?? LeagueMatchStatus.Scheduled,
    notes: input.notes ?? null,
  });
}

// ---- Handlers ------------------------------------------------------------

export class AddLeagueScheduleMatchHandler {
  constructor(
    private readonly events: EventRepository,
    private readonly schedules: LeagueScheduleRepository,
  ) {}

  async execute(cmd: AddLeagueScheduleMatchCommand): Promise<{ matchId: string }> {
    const evt = await loadEventOrThrow(this.events, cmd.eventId);
    assertHost(evt.hostId, cmd.requesterId);
    assertLeagueDivision(evt, cmd.divisionId);
    const schedule = await loadScheduleOrThrow(this.schedules, cmd.divisionId);
    const id = this.schedules.nextMatchId();
    schedule.addMatch(buildMatch(id, cmd.match));
    await this.schedules.save(schedule);
    return { matchId: String(id) };
  }
}

export class UpdateLeagueScheduleMatchHandler {
  constructor(
    private readonly events: EventRepository,
    private readonly schedules: LeagueScheduleRepository,
  ) {}

  async execute(cmd: UpdateLeagueScheduleMatchCommand): Promise<void> {
    const evt = await loadEventOrThrow(this.events, cmd.eventId);
    assertHost(evt.hostId, cmd.requesterId);
    assertLeagueDivision(evt, cmd.divisionId);
    const schedule = await loadScheduleOrThrow(this.schedules, cmd.divisionId);
    const existing = schedule.matches.find((m) => String(m.id) === cmd.matchId);
    if (!existing) throw new NotFoundError('LeagueScheduleMatch', cmd.matchId);
    const scores =
      cmd.match.homeScore !== undefined || cmd.match.awayScore !== undefined
        ? {
            homeScore: cmd.match.homeScore ?? null,
            awayScore: cmd.match.awayScore ?? null,
          }
        : { homeScore: existing.homeScore, awayScore: existing.awayScore };
    schedule.replaceMatch(buildMatch(existing.id, cmd.match, scores));
    await this.schedules.save(schedule);
  }
}

export class RemoveLeagueScheduleMatchHandler {
  constructor(
    private readonly events: EventRepository,
    private readonly schedules: LeagueScheduleRepository,
  ) {}

  async execute(cmd: RemoveLeagueScheduleMatchCommand): Promise<void> {
    const evt = await loadEventOrThrow(this.events, cmd.eventId);
    assertHost(evt.hostId, cmd.requesterId);
    assertLeagueDivision(evt, cmd.divisionId);
    const schedule = await loadScheduleOrThrow(this.schedules, cmd.divisionId);
    schedule.removeMatch(cmd.matchId as LeagueScheduleMatchId);
    await this.schedules.save(schedule);
  }
}

export class RecordLeagueMatchResultHandler {
  constructor(private readonly schedules: LeagueScheduleRepository) {}

  async execute(cmd: RecordLeagueMatchResultCommand): Promise<void> {
    // Permissions for "host or captain of either team" are enforced by
    // Postgres RLS at the persistence boundary — but only because the write
    // goes through the narrow `recordMatchResult` port (a single-row UPDATE
    // gated by the `league_schedule_matches_update` policy) invoked with a
    // user-scoped client. The host-only full-replace `save` would bypass
    // that gate. The domain validates the resulting match shape before the
    // persist; the DB has the final say on authorization.
    const schedule = await loadScheduleOrThrow(this.schedules, cmd.divisionId);
    const existing = schedule.matches.find((m) => String(m.id) === cmd.matchId);
    if (!existing) throw new NotFoundError('LeagueScheduleMatch', cmd.matchId);
    const status = cmd.status ?? LeagueMatchStatus.Completed;
    if (status !== LeagueMatchStatus.Completed && status !== LeagueMatchStatus.Forfeit) {
      throw new ValidationError("Recorded result status must be 'completed' or 'forfeit'.", {
        status,
      });
    }
    // Construct through the value object so its invariants (non-negative
    // integer scores, etc.) run before we hit the DB — mirrors the
    // `league_schedule_matches` CHECK constraints. The result is discarded;
    // persistence is the narrow, RLS-enforced UPDATE below.
    LeagueScheduleMatch.create({
      id: existing.id,
      weekNumber: existing.weekNumber,
      scheduledAt: existing.scheduledAt,
      courtLabel: existing.courtLabel,
      homeTeamId: existing.homeTeamId,
      awayTeamId: existing.awayTeamId,
      homeScore: cmd.homeScore,
      awayScore: cmd.awayScore,
      status,
      notes: existing.notes,
    });
    await this.schedules.recordMatchResult({
      divisionId: cmd.divisionId as DivisionId,
      matchId: existing.id,
      homeScore: cmd.homeScore,
      awayScore: cmd.awayScore,
      status,
    });
  }
}
