import {
  effectiveBestOf,
  effectiveSetTargetScore,
  effectiveTargetScore,
  type Match,
  type MatchTargetDefaults,
} from '@pickupvb/domain';
import { SubmitButton } from '@/components/submit-button';
import { LiveScore } from '../../_components/live-score';
import { ScoreLiveButton } from '../../_components/score-live-button';
import { bindBracketActions, eventScope } from './bracket-action-binding';
import type { BracketScope, TeamLite } from './labels';

export function MatchCard(props: {
  /** Event path only — present for the live-scoring launcher. Standalone
   *  brackets (ADR 0025) omit these and pass `scope`. */
  eventId?: string;
  divisionId?: string;
  /** Standalone scope; defaults to the event scope from eventId/divisionId. */
  scope?: BracketScope;
  match: Match;
  teamById: ReadonlyMap<string, TeamLite>;
  /** Bracket-wide / pool-stage default best-of (ADR 0032). The card resolves the
   *  match's *effective* best-of from this, the playoff-stage default, and any
   *  per-match override — so the score form shows the right number of sets. */
  bestOf: number;
  /** Stage / global default target score (ADR 0032); per-match override wins. */
  targetScore?: number | null;
  /** Per-game pool/global target scores (ADR 0032) — labels each set input. */
  targetScores?: ReadonlyArray<number> | null;
  /** Playoff-stage best-of default (`pool_play_playoff`) — applied to `final`
   *  matches when they carry no per-match override. */
  playoffBestOf?: number | null;
  /** Playoff-stage target-score default (`pool_play_playoff`). */
  playoffTargetScore?: number | null;
  /** Per-game playoff target scores (ADR 0032). */
  playoffTargetScores?: ReadonlyArray<number> | null;
  isHost: boolean;
  viewerId: string | null;
  /** Host is Pro → the "Score live" launcher is offered (ADR 0023). */
  liveScoringEnabled?: boolean;
}) {
  const scope = props.scope ?? eventScope(props.eventId!, props.divisionId!);
  const a = bindBracketActions(scope);
  const m = props.match;
  const teamA = m.entryAId ? props.teamById.get(m.entryAId) : null;
  const teamB = m.entryBId ? props.teamById.get(m.entryBId) : null;
  const workTeam = m.workTeamId ? props.teamById.get(m.workTeamId) : null;
  const winner = m.winnerEntryId;
  const canEdit =
    props.isHost ||
    (props.viewerId !== null &&
      ((teamA && teamA.captainId === props.viewerId) ||
        (teamB && teamB.captainId === props.viewerId)));

  const aWins = m.sets.filter((s) => s.teamAScore > s.teamBScore).length;
  const bWins = m.sets.filter((s) => s.teamBScore > s.teamAScore).length;

  // Resolve this match's *effective* length (per-match override → playoff-stage
  // default → bracket default) so the score form offers exactly enough set
  // inputs to clinch — a best-of-3 playoff in a best-of-1 tournament needs two
  // boxes, and a match edited down to best-of-1 needs only one. Mirrors the
  // domain's own winner resolution (ADR 0032).
  const matchBestOf = effectiveBestOf(m, {
    bestOf: props.bestOf,
    playoffBestOf: props.playoffBestOf ?? null,
  });
  const targetDefaults: MatchTargetDefaults = {
    targetScore: props.targetScore ?? null,
    playoffTargetScore: props.playoffTargetScore ?? null,
    targetScores: props.targetScores ?? null,
    playoffTargetScores: props.playoffTargetScores ?? null,
  };
  const matchTargetScore = effectiveTargetScore(m, targetDefaults);
  const lengthDiffersFromDefault =
    matchBestOf !== props.bestOf || matchTargetScore !== (props.targetScore ?? null);

  const setsToShow = Math.max(matchBestOf, m.sets.length + 1);

  return (
    <div
      className={`rounded-shape-sm border p-3 text-sm ${
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
      {/* Per-match length / point-total (ADR 0032) — shown only when this match
          differs from the bracket default (a per-match override or a distinct
          playoff-stage length), so the row stays quiet otherwise. */}
      {lengthDiffersFromDefault && (
        <p className="text-muted -mt-1 mb-2 text-xs">
          Best of {matchBestOf}
          {matchTargetScore != null ? ` · to ${matchTargetScore}` : ''}
        </p>
      )}
      <ul className="space-y-1">
        <TeamRow team={teamA} wins={aWins} isWinner={winner === m.entryAId} />
        <TeamRow team={teamB} wins={bWins} isWinner={winner === m.entryBId} />
      </ul>

      {m.status !== 'completed' && m.status !== 'bye' && <LiveScore matchId={String(m.id)} />}

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

      {props.liveScoringEnabled && canEdit && m.status !== 'bye' && teamA && teamB && (
        <div className="mt-2">
          <ScoreLiveButton
            kind="bracket"
            matchId={String(m.id)}
            teamA={teamA.name}
            teamB={teamB.name}
            bestOf={matchBestOf}
            {...(scope.kind === 'standalone'
              ? { bracketId: scope.bracketId, returnPath: `/brackets/${scope.bracketId}` }
              : {
                  eventId: scope.eventId,
                  divisionId: scope.divisionId,
                  returnPath: `/events/${scope.eventId}/bracket?division=${scope.divisionId}`,
                })}
          />
        </div>
      )}

      {canEdit && m.status !== 'bye' && teamA && teamB && (
        <details className="mt-2">
          <summary className="text-primary cursor-pointer text-xs hover:underline">
            {m.status === 'completed' ? 'Edit result' : 'Enter result'}
          </summary>
          <form action={a.recordResult(String(m.id))} className="mt-2 space-y-1">
            {Array.from({ length: setsToShow }, (_, i) => {
              const existing = m.sets[i];
              const setTarget = effectiveSetTargetScore(m, i + 1, targetDefaults);
              return (
                <div key={i} className="flex items-center gap-1 text-xs">
                  <span className="text-muted w-16 shrink-0">
                    Set {i + 1}
                    {setTarget != null && <span className="text-muted/70"> · {setTarget}</span>}
                  </span>
                  <input
                    name={`set_a_${i + 1}`}
                    type="number"
                    min="0"
                    defaultValue={existing?.teamAScore ?? ''}
                    aria-label={`${teamA?.name ?? 'Team A'}, set ${i + 1} score`}
                    className="border-border-base bg-bg w-16 rounded border px-1 py-0.5"
                  />
                  <span className="text-muted">{'–'}</span>
                  <input
                    name={`set_b_${i + 1}`}
                    type="number"
                    min="0"
                    defaultValue={existing?.teamBScore ?? ''}
                    aria-label={`${teamB?.name ?? 'Team B'}, set ${i + 1} score`}
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
                  formAction={a.resetMatch(String(m.id))}
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
  team: { name: string } | null | undefined;
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
