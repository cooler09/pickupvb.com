import type { Match } from '@pickupvb/domain';
import { recordMatchResultFromForm, resetMatch } from '../actions';
import type { TeamLite } from './labels';

export function MatchCard(props: {
    eventId: string;
    match: Match;
    teamById: ReadonlyMap<string, TeamLite>;
    bestOf: number;
    isHost: boolean;
    viewerId: string | null;
}) {
    const m = props.match;
    const teamA = m.teamAId ? props.teamById.get(m.teamAId) : null;
    const teamB = m.teamBId ? props.teamById.get(m.teamBId) : null;
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
            className={`rounded-lg border p-3 text-sm ${m.status === 'completed'
                ? 'border-green-500/30 bg-green-500/5'
                : 'border-border-base bg-bg'
                }`}
        >
            <div className="mb-2 flex items-center justify-between text-xs text-muted">
                <span>Match {m.matchNumber}</span>
                <span className="capitalize">{m.status.replace('_', ' ')}</span>
            </div>
            <ul className="space-y-1">
                <TeamRow team={teamA} wins={aWins} isWinner={winner === m.teamAId} />
                <TeamRow team={teamB} wins={bWins} isWinner={winner === m.teamBId} />
            </ul>

            {m.sets.length > 0 && (
                <p className="mt-2 text-xs text-muted">
                    Sets:{' '}
                    {m.sets.map((s) => `${s.teamAScore}–${s.teamBScore}`).join(', ')}
                </p>
            )}

            {canEdit && m.status !== 'bye' && teamA && teamB && (
                <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-primary hover:underline">
                        {m.status === 'completed' ? 'Edit result' : 'Enter result'}
                    </summary>
                    <form
                        action={recordMatchResultFromForm.bind(null, props.eventId, String(m.id))}
                        className="mt-2 space-y-1"
                    >
                        {Array.from({ length: setsToShow }, (_, i) => {
                            const existing = m.sets[i];
                            return (
                                <div key={i} className="flex items-center gap-1 text-xs">
                                    <span className="w-12 text-muted">Set {i + 1}</span>
                                    <input
                                        name={`set_a_${i + 1}`}
                                        type="number"
                                        min="0"
                                        defaultValue={existing?.teamAScore ?? ''}
                                        className="w-16 rounded border border-border-base bg-bg px-1 py-0.5"
                                    />
                                    <span className="text-muted">{'–'}</span>
                                    <input
                                        name={`set_b_${i + 1}`}
                                        type="number"
                                        min="0"
                                        defaultValue={existing?.teamBScore ?? ''}
                                        className="w-16 rounded border border-border-base bg-bg px-1 py-0.5"
                                    />
                                </div>
                            );
                        })}
                        <div className="flex gap-2 pt-1">
                            <button
                                type="submit"
                                className="rounded bg-primary px-2 py-0.5 text-xs text-primary-fg"
                            >
                                Save
                            </button>
                            {m.status === 'completed' && (
                                <button
                                    type="submit"
                                    formAction={resetMatch.bind(null, props.eventId, String(m.id))}
                                    className="rounded border border-border-base px-2 py-0.5 text-xs text-fg/80 hover:bg-fg/5"
                                >
                                    Clear
                                </button>
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
            className={`flex items-center justify-between gap-2 rounded px-2 py-1 ${props.isWinner ? 'bg-green-500/10 font-medium text-fg' : 'text-fg/80'
                }`}
        >
            <span className="truncate">
                {props.team?.name ?? <span className="italic text-muted">TBD</span>}
            </span>
            <span className="tabular-nums text-xs text-muted">{props.wins}</span>
        </li>
    );
}
