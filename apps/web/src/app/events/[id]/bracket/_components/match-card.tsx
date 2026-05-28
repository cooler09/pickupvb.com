import type { Match } from '@pickupvb/domain';
import { SubmitButton } from '@/components/submit-button';
import { recordMatchResultFromForm, resetMatch } from '../actions';
import type { TeamLite } from './labels';

export function MatchCard(props: {
  eventId: string;
  divisionId: string;
  match: Match;
  teamById: ReadonlyMap<string, TeamLite>;
  bestOf: number;
  isHost: boolean;
  viewerId: string | null;
}) {
  const m = props.match;
  const teamA = m.teamAId ? props.teamById.get(m.teamAId) : null;
  const teamB = m.teamBId ? props.teamById.get(m.teamBId) : null;
  const workTeam = m.workTeamId ? props.teamById.get(m.workTeamId) : null;
  const winner = m.winnerTeamId;
  const canEdit =
    props.isHost ||
    (props.viewerId !== null &&
      ((teamA && teamA.captainId === props.viewerId) ||
        (teamB && teamB.captainId === props.viewerId)));

  const aWins = m.sets.filter((s) => s.teamAScore > s.teamBScore).length;
  const bWins = m.sets.filter((s) => s.teamBScore > s.teamAScore).length;

  const setsToShow = Math.max(props.bestOf, m.sets.length + 1);

  return (
    <div
      className={`rounded-lg border p-3 text-sm ${
        m.status === 'completed' ? 'border-green-500/30 bg-green-500/5' : 'border-border-base bg-bg'
      }`}
    >
      <div className="text-muted mb-2 flex items-center justify-between text-xs">
        <span>Match {m.matchNumber}</span>
        <span className="capitalize">{m.status.replace('_', ' ')}</span>
      </div>
      {(m.court || m.slot) && (
        <p className="text-muted -mt-1 mb-2 text-xs">
          {m.court ? <span className="text-fg/70 font-medium">{m.court}</span> : null}
          {m.court && m.slot ? ' · ' : null}
          {m.slot ? <span>Slot {m.slot}</span> : null}
        </p>
      )}
      <ul className="space-y-1">
        <TeamRow team={teamA} wins={aWins} isWinner={winner === m.teamAId} />
        <TeamRow team={teamB} wins={bWins} isWinner={winner === m.teamBId} />
      </ul>

      {m.sets.length > 0 && (
        <p className="text-muted mt-2 text-xs">
          Sets: {m.sets.map((s) => `${s.teamAScore}–${s.teamBScore}`).join(', ')}
        </p>
      )}

      {workTeam && (
        <p className="text-muted mt-2 text-xs">
          <span className="text-fg/70 font-medium">Work team: </span>
          {workTeam.name}
        </p>
      )}

      {canEdit && m.status !== 'bye' && teamA && teamB && (
        <details className="mt-2">
          <summary className="text-primary cursor-pointer text-xs hover:underline">
            {m.status === 'completed' ? 'Edit result' : 'Enter result'}
          </summary>
          <form
            action={recordMatchResultFromForm.bind(
              null,
              props.eventId,
              props.divisionId,
              String(m.id),
            )}
            className="mt-2 space-y-1"
          >
            {Array.from({ length: setsToShow }, (_, i) => {
              const existing = m.sets[i];
              return (
                <div key={i} className="flex items-center gap-1 text-xs">
                  <span className="text-muted w-12">Set {i + 1}</span>
                  <input
                    name={`set_a_${i + 1}`}
                    type="number"
                    min="0"
                    defaultValue={existing?.teamAScore ?? ''}
                    className="border-border-base bg-bg w-16 rounded border px-1 py-0.5"
                  />
                  <span className="text-muted">{'–'}</span>
                  <input
                    name={`set_b_${i + 1}`}
                    type="number"
                    min="0"
                    defaultValue={existing?.teamBScore ?? ''}
                    className="border-border-base bg-bg w-16 rounded border px-1 py-0.5"
                  />
                </div>
              );
            })}
            <div className="flex gap-2 pt-1">
              <SubmitButton className="bg-primary text-primary-fg rounded px-2 py-0.5 text-xs disabled:opacity-50">
                Save
              </SubmitButton>
              {m.status === 'completed' && (
                <SubmitButton
                  formAction={resetMatch.bind(null, props.eventId, props.divisionId, String(m.id))}
                  className="border-border-base text-fg/80 hover:bg-fg/5 rounded border px-2 py-0.5 text-xs disabled:opacity-50"
                >
                  Clear
                </SubmitButton>
              )}
            </div>
          </form>
        </details>
      )}
    </div>
  );
}

function TeamRow(props: {
  team: { teamId: string; name: string } | null | undefined;
  wins: number;
  isWinner: boolean;
}) {
  return (
    <li
      className={`flex items-center justify-between gap-2 rounded px-2 py-1 ${
        props.isWinner ? 'text-fg bg-green-500/10 font-medium' : 'text-fg/80'
      }`}
    >
      <span className="truncate">
        {props.team?.name ?? <span className="text-muted italic">TBD</span>}
      </span>
      <span className="text-muted text-xs tabular-nums">{props.wins}</span>
    </li>
  );
}
