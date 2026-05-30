import {
  addMatchFromForm,
  recordResultFromForm,
  removeMatch,
  updateMatchFromForm,
} from '../actions';
import { LocalDateTime } from '@/components/local-datetime';
import { primaryButtonClass } from '@/components/primary-button';
import { LiveScore } from '../../_components/live-score';
import { ScoreLiveButton } from '../../_components/score-live-button';

type Status = 'scheduled' | 'in_progress' | 'completed' | 'forfeit' | 'cancelled';

export type ScheduleTeam = { teamId: string; name: string };

export type ScheduleMatchVm = {
  id: string;
  weekNumber: number;
  scheduledAt: string;
  courtLabel: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: Status;
  notes: string | null;
};

const STATUS_LABEL: Record<Status, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Final',
  forfeit: 'Forfeit',
  cancelled: 'Cancelled',
};

const inputClass =
  'border-border-base bg-bg text-fg w-full rounded border px-2 py-1 text-sm focus:ring-1';

function toDatetimeLocal(iso: string): string {
  // Echo back the value as `YYYY-MM-DDTHH:mm` in UTC. Time zone conversion
  // against the event's TZ is a follow-up (the server action mirrors this
  // simplification).
  return iso.slice(0, 16);
}

function teamLabel(teams: ReadonlyArray<ScheduleTeam>, id: string | null): string {
  if (!id) return 'TBD';
  return teams.find((t) => t.teamId === id)?.name ?? 'Unknown team';
}

function teamSelect(name: string, selected: string | null, teams: ReadonlyArray<ScheduleTeam>) {
  return (
    <select name={name} defaultValue={selected ?? 'tbd'} className={inputClass}>
      <option value="tbd">TBD</option>
      {teams.map((t) => (
        <option key={t.teamId} value={t.teamId}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

export function AddMatchForm(props: {
  eventId: string;
  divisionId: string;
  returnPath: string;
  teams: ReadonlyArray<ScheduleTeam>;
  defaultWeek: number;
}) {
  const { eventId, divisionId, returnPath, teams, defaultWeek } = props;
  return (
    <form
      action={addMatchFromForm.bind(null, eventId, divisionId, returnPath)}
      className="border-border-base bg-fg/5 grid grid-cols-1 gap-3 rounded border p-3 sm:grid-cols-6"
    >
      <label className="sm:col-span-1">
        <span className="text-muted block text-xs">Week</span>
        <input
          name="week"
          type="number"
          min={1}
          defaultValue={defaultWeek}
          required
          className={inputClass}
        />
      </label>
      <label className="sm:col-span-2">
        <span className="text-muted block text-xs">When</span>
        <input name="scheduledAt" type="datetime-local" required className={inputClass} />
      </label>
      <label className="sm:col-span-1">
        <span className="text-muted block text-xs">Court</span>
        <input name="courtLabel" type="text" maxLength={40} className={inputClass} />
      </label>
      <label className="sm:col-span-1">
        <span className="text-muted block text-xs">Home</span>
        {teamSelect('homeTeamId', null, teams)}
      </label>
      <label className="sm:col-span-1">
        <span className="text-muted block text-xs">Away</span>
        {teamSelect('awayTeamId', null, teams)}
      </label>
      <div className="flex justify-end sm:col-span-6">
        <button type="submit" className={primaryButtonClass()}>
          Add match
        </button>
      </div>
    </form>
  );
}

export function MatchRow(props: {
  eventId: string;
  divisionId: string;
  matchId: string;
  returnPath: string;
  match: ScheduleMatchVm;
  teams: ReadonlyArray<ScheduleTeam>;
  timeZone: string | null;
  isHost: boolean;
  /** Host is Pro → the "Score live" launcher is offered (ADR 0023). */
  liveScoringEnabled?: boolean;
}) {
  const { eventId, divisionId, matchId, returnPath, match, teams, timeZone, isHost } = props;
  return (
    <li className="border-border-base bg-bg space-y-3 rounded border p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-muted text-xs">Week {match.weekNumber}</span>
        <span className="text-fg text-sm font-medium">
          <LocalDateTime
            iso={match.scheduledAt}
            variant="eventDateLong"
            {...(timeZone ? { timeZone } : {})}
          />
        </span>
        {match.courtLabel && <span className="text-muted text-xs">Court: {match.courtLabel}</span>}
        <span className="text-muted ml-auto text-xs">{STATUS_LABEL[match.status]}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-fg font-medium">{teamLabel(teams, match.homeTeamId)}</span>
        <span className="text-muted">vs</span>
        <span className="text-fg font-medium">{teamLabel(teams, match.awayTeamId)}</span>
        {(match.homeScore !== null || match.awayScore !== null) && (
          <span className="text-fg ml-3 font-mono">
            {match.homeScore ?? '–'}–{match.awayScore ?? '–'}
          </span>
        )}
      </div>

      {(match.status === 'scheduled' || match.status === 'in_progress') && (
        <LiveScore matchId={matchId} />
      )}

      {match.notes && <p className="text-muted text-xs whitespace-pre-wrap">{match.notes}</p>}

      {isHost && props.liveScoringEnabled && match.homeTeamId && match.awayTeamId && (
        <ScoreLiveButton
          kind="league"
          eventId={eventId}
          divisionId={divisionId}
          matchId={matchId}
          teamA={teamLabel(teams, match.homeTeamId)}
          teamB={teamLabel(teams, match.awayTeamId)}
          bestOf={1}
          returnPath={returnPath}
        />
      )}

      {isHost && (
        <details className="text-sm">
          <summary className="text-primary cursor-pointer text-xs">Edit / record result</summary>
          <div className="mt-3 space-y-3">
            <form
              action={updateMatchFromForm.bind(null, eventId, divisionId, matchId, returnPath)}
              className="grid grid-cols-1 gap-2 sm:grid-cols-6"
            >
              <input
                name="week"
                type="number"
                min={1}
                defaultValue={match.weekNumber}
                required
                className={`${inputClass} sm:col-span-1`}
              />
              <input
                name="scheduledAt"
                type="datetime-local"
                defaultValue={toDatetimeLocal(match.scheduledAt)}
                required
                className={`${inputClass} sm:col-span-2`}
              />
              <input
                name="courtLabel"
                type="text"
                maxLength={40}
                defaultValue={match.courtLabel ?? ''}
                placeholder="Court"
                className={`${inputClass} sm:col-span-1`}
              />
              <div className="sm:col-span-1">
                {teamSelect('homeTeamId', match.homeTeamId, teams)}
              </div>
              <div className="sm:col-span-1">
                {teamSelect('awayTeamId', match.awayTeamId, teams)}
              </div>
              <textarea
                name="notes"
                rows={2}
                defaultValue={match.notes ?? ''}
                placeholder="Notes"
                maxLength={1000}
                className={`${inputClass} sm:col-span-6`}
              />
              <div className="flex justify-end gap-2 sm:col-span-6">
                <button type="submit" className={primaryButtonClass()}>
                  Save
                </button>
              </div>
            </form>

            <form
              action={recordResultFromForm.bind(null, eventId, divisionId, matchId, returnPath)}
              className="border-border-base flex flex-wrap items-end gap-2 rounded border border-dashed p-2"
            >
              <label className="text-xs">
                <span className="text-muted block">Home</span>
                <input
                  name="homeScore"
                  type="number"
                  min={0}
                  defaultValue={match.homeScore ?? ''}
                  required
                  className={inputClass}
                />
              </label>
              <label className="text-xs">
                <span className="text-muted block">Away</span>
                <input
                  name="awayScore"
                  type="number"
                  min={0}
                  defaultValue={match.awayScore ?? ''}
                  required
                  className={inputClass}
                />
              </label>
              <label className="text-xs">
                <span className="text-muted block">Status</span>
                <select
                  name="status"
                  defaultValue={match.status === 'forfeit' ? 'forfeit' : 'completed'}
                  className={inputClass}
                >
                  <option value="completed">Final</option>
                  <option value="forfeit">Forfeit</option>
                </select>
              </label>
              <button type="submit" className={primaryButtonClass()}>
                Record result
              </button>
            </form>

            <form action={removeMatch.bind(null, eventId, divisionId, matchId, returnPath)}>
              <button
                type="submit"
                className="text-xs text-red-600 hover:underline dark:text-red-400"
              >
                Delete match
              </button>
            </form>
          </div>
        </details>
      )}
    </li>
  );
}
