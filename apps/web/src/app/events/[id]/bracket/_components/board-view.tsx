import type { ReactNode } from 'react';
import {
  computePoolStandings,
  distinctPools,
  rankAcrossPools,
  type BracketFormat,
  type Match,
  type PoolStanding,
} from '@pickupvb/domain';
import { AddMatchButton } from './add-match-button';
import { MatchCard } from './match-card';
import { MatchEditor } from './match-editor';
import { ReseedPlayoffButton } from './reseed-playoff-button';
import { bindBracketActions, eventScope } from './bracket-action-binding';
import type { BracketScope, TeamLite } from './labels';
import { FormModal, ModalActions } from '@/components/form-modal';
import { SubmitButton } from '@/components/submit-button';
import { neutralButtonClass, primaryButtonClass } from '@/components/primary-button';
import { TreeBracket } from './tree-bracket';

/**
 * Pick the match a spectator most likely wants to look at right now.
 *
 *   1. In-progress: a match with any sets recorded that isn't yet
 *      completed. Tie-break by highest round, then highest matchNumber
 *      (deepest into the bracket = most consequential).
 *   2. Most recently completed: same tie-break — the last finished match.
 *   3. Next up: lowest-numbered pending match with both teams known.
 *
 * Returns `null` when the bracket has no eligible matches yet (all TBD).
 */
export function pickLatestMatchId(matches: ReadonlyArray<Match>): string | null {
  const live = matches.filter(
    (m) =>
      m.status === 'in_progress' ||
      (m.status !== 'completed' && m.status !== 'bye' && m.sets.length > 0),
  );
  if (live.length > 0) {
    const m = [...live].sort((a, b) => b.round - a.round || b.matchNumber - a.matchNumber)[0]!;
    return String(m.id);
  }
  // A pending *deciding* final outranks an already-finished one: the
  // double-elim reset (a higher-round final than the just-completed grand final)
  // or the championship awaiting both semifinalists. That's the match everyone's
  // watching for next, so prefer it over the last completed result.
  const completedFinals = matches.filter(
    (m) => m.bracketSide === 'final' && m.status === 'completed',
  );
  if (completedFinals.length > 0) {
    const maxDoneRound = Math.max(...completedFinals.map((m) => m.round));
    const deciding = matches.find(
      (m) =>
        m.bracketSide === 'final' &&
        m.status === 'pending' &&
        !!m.entryAId &&
        !!m.entryBId &&
        m.round > maxDoneRound,
    );
    if (deciding) return String(deciding.id);
  }
  const done = matches.filter((m) => m.status === 'completed');
  if (done.length > 0) {
    const m = [...done].sort((a, b) => b.round - a.round || b.matchNumber - a.matchNumber)[0]!;
    return String(m.id);
  }
  const next = matches.filter((m) => m.status === 'pending' && m.entryAId && m.entryBId);
  if (next.length > 0) {
    const m = [...next].sort((a, b) => a.round - b.round || a.matchNumber - b.matchNumber)[0]!;
    return String(m.id);
  }
  return null;
}

export function BoardView(props: {
  /** Event path only — present for the live-scoring launcher. Standalone
   *  brackets (ADR 0025) omit these and pass `scope` instead. */
  eventId?: string;
  divisionId?: string;
  /** Standalone scope; defaults to the event scope from eventId/divisionId. */
  scope?: BracketScope;
  matches: ReadonlyArray<Match>;
  teamById: ReadonlyMap<string, TeamLite>;
  /** Deduped registered teams — drives the host MatchEditor / substitute pickers
   *  (ADR 0032). Optional so the standalone / spectator callers compile unchanged. */
  teams?: ReadonlyArray<TeamLite>;
  bestOf: number;
  /** Stage / global default target score, shown on match cards. */
  targetScore?: number | null;
  isHost: boolean;
  viewerId: string | null;
  status: 'active' | 'completed';
  format: BracketFormat;
  /** When set, the matching card is rendered with a ring and a "Jump to latest" link appears at the top. */
  highlightMatchId?: string | null;
  /** Host is Pro → MatchCards offer the "Score live" launcher (ADR 0023). */
  liveScoringEnabled?: boolean;
  /** Pool play: teams advancing per pool — lets the host re-seed the playoff
   *  (ADR 0032). Omitted ⇒ no re-seed affordance. */
  advancePerPool?: number;
}) {
  const scope = props.scope ?? eventScope(props.eventId!, props.divisionId!);
  const a = bindBracketActions(scope);
  const teams = props.teams ?? [];
  // Host/owner structural edits (fix a matchup, court, length) are a live-bracket
  // privilege (ADR 0032) — for both event and standalone scope (TT-11). On a
  // completed bracket the host must Reopen first (editMatch is rejected once
  // completed).
  const canStructEdit = props.isHost && props.status === 'active';
  const hostEdit = (m: Match): ReactNode =>
    canStructEdit && m.status !== 'bye' ? (
      <div className="mt-1 text-right">
        <MatchEditor
          scope={scope}
          match={{
            id: String(m.id),
            entryAId: m.entryAId,
            entryBId: m.entryBId,
            court: m.court,
            bestOf: m.bestOf,
            targetScore: m.targetScore,
          }}
          teams={teams}
          defaultBestOf={props.bestOf}
          defaultTargetScore={props.targetScore ?? null}
          allowRemove={false}
        />
      </div>
    ) : null;
  const isPoolPlay = props.format === 'pool_play_playoff';
  const isDoubleElim = props.format === 'double_elimination';
  const poolMatches = props.matches.filter((m) => m.pool !== null);
  const playoffMatches = props.matches.filter((m) => m.bracketSide === 'final');
  const winnersMatches = props.matches.filter((m) => m.bracketSide === 'winners');
  const losersMatches = props.matches.filter((m) => m.bracketSide === 'losers');
  const otherMatches = props.matches.filter(
    (m) =>
      m.pool === null &&
      m.bracketSide !== 'final' &&
      m.bracketSide !== 'winners' &&
      m.bracketSide !== 'losers',
  );

  // For pool play, "pool play complete" gates the playoff CTA.
  const poolPlayComplete =
    isPoolPlay &&
    poolMatches.length > 0 &&
    poolMatches.every((m) => m.status === 'completed' || m.status === 'bye');
  const playoffExists = playoffMatches.length > 0;
  // Host may add a game to a "free" schedule (pool play / round robin) while the
  // bracket is live, e.g. to give a pool an extra match (the domain allows
  // addMatch in `active`). Elimination brackets are wired and must not gain
  // ad-hoc games.
  const canAddGame =
    props.isHost && props.status === 'active' && (isPoolPlay || props.format === 'round_robin');

  // Host may override the auto cross-seed before any playoff match starts. The
  // current order is recomputed (rankAcrossPools) so the picker pre-fills with
  // the existing seeding — leaving it untouched is a no-op.
  const playoffStarted = playoffMatches.some((m) => m.status !== 'pending' && m.status !== 'bye');
  const canReseedPlayoff =
    isPoolPlay &&
    props.isHost &&
    props.status === 'active' &&
    playoffExists &&
    !playoffStarted &&
    props.advancePerPool != null;
  let playoffSeedTeams: { entryId: string; name: string }[] = [];
  if (canReseedPlayoff) {
    try {
      const standingsByPool = distinctPools(poolMatches).map((p) =>
        computePoolStandings(props.matches, p),
      );
      playoffSeedTeams = rankAcrossPools(standingsByPool, props.advancePerPool!)
        .map((id) => {
          const t = props.teamById.get(String(id));
          return t ? { entryId: String(id), name: t.name } : null;
        })
        .filter((x): x is { entryId: string; name: string } => x !== null);
    } catch {
      playoffSeedTeams = [];
    }
  }

  const renderMatch = (m: Match) => {
    const isHighlighted = !!props.highlightMatchId && String(m.id) === props.highlightMatchId;
    return (
      <div
        id={`match-${String(m.id)}`}
        className={`rounded-shape-sm scroll-mt-24 ${isHighlighted ? 'ring-primary ring-2 ring-offset-2 ring-offset-transparent' : ''}`}
      >
        <MatchCard
          scope={scope}
          {...(props.eventId ? { eventId: props.eventId } : {})}
          {...(props.divisionId ? { divisionId: props.divisionId } : {})}
          match={m}
          teamById={props.teamById}
          bestOf={props.bestOf}
          targetScore={props.targetScore ?? null}
          isHost={props.isHost}
          viewerId={props.viewerId}
          liveScoringEnabled={props.liveScoringEnabled ?? false}
        />
        {hostEdit(m)}
      </div>
    );
  };

  const renderRoundColumns = (
    list: ReadonlyArray<Match>,
    roundLabel: (r: number) => string = (r) => `Round ${r}`,
  ) => <TreeBracket matches={list} renderMatch={renderMatch} roundLabel={roundLabel} />;

  return (
    <section className="space-y-6 scroll-smooth">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted text-sm">
          Best of {props.bestOf} • {props.status === 'completed' ? 'Final results' : 'In progress'}
        </p>
        <div className="flex items-center gap-2">
          {props.highlightMatchId && (
            <a
              href={`#match-${props.highlightMatchId}`}
              className="border-primary/40 text-primary hover:bg-primary/5 rounded border px-2 py-1 text-xs font-medium"
            >
              {'Jump to latest →'}
            </a>
          )}
          {props.isHost && props.status === 'active' && (
            <details className="text-xs">
              <summary className="cursor-pointer rounded border border-red-500/40 px-2 py-1 text-red-600 hover:bg-red-500/10">
                Reset bracket
              </summary>
              <div className="mt-2 space-y-2 rounded border border-red-500/30 bg-red-500/5 p-2">
                <p className="text-red-700 dark:text-red-300">
                  Returns the bracket to seeding so you can swap teams in or out, then re-generate.
                  Any entered match results will be discarded.
                </p>
                <form action={a.reset}>
                  <SubmitButton className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50">
                    Reset and re-seed
                  </SubmitButton>
                </form>
              </div>
            </details>
          )}
        </div>
      </div>

      {/* Live host/owner tools — Substitute + per-match Edit while active,
          Re-open once completed. Works for both event and standalone scope
          (TT-11). */}
      {props.isHost && <LiveHostTools scope={scope} status={props.status} teams={teams} />}

      {isPoolPlay && poolMatches.length > 0 && (
        <PoolsView
          scope={scope}
          {...(props.eventId ? { eventId: props.eventId } : {})}
          {...(props.divisionId ? { divisionId: props.divisionId } : {})}
          matches={poolMatches}
          teamById={props.teamById}
          teams={teams}
          bestOf={props.bestOf}
          targetScore={props.targetScore ?? null}
          isHost={props.isHost}
          viewerId={props.viewerId}
          highlightMatchId={props.highlightMatchId ?? null}
          liveScoringEnabled={props.liveScoringEnabled ?? false}
          hostEdit={hostEdit}
          canAddGame={canAddGame}
        />
      )}

      {isPoolPlay && poolPlayComplete && !playoffExists && (
        <div className="border-primary/40 bg-primary/5 rounded-shape-sm border p-3 text-sm">
          {props.isHost ? (
            <form action={a.generatePlayoff} className="flex items-center justify-between gap-2">
              <span>Pool play is complete. Generate the playoff bracket?</span>
              <SubmitButton className={primaryButtonClass()}>Generate playoff</SubmitButton>
            </form>
          ) : (
            <span className="text-muted">
              Pool play is complete. Waiting for the host to generate the playoff.
            </span>
          )}
        </div>
      )}

      {isDoubleElim && winnersMatches.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-fg text-base font-semibold">Winners bracket</h2>
          {renderRoundColumns(winnersMatches, (r) => `WB R${r}`)}
        </div>
      )}

      {isDoubleElim && losersMatches.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-fg text-base font-semibold">Losers bracket</h2>
          {renderRoundColumns(losersMatches, (r) => `LB R${r}`)}
        </div>
      )}

      {isDoubleElim &&
        (() => {
          // The grand final + (conditional) reset are both `bracketSide:'final'`.
          // Show the reset only once it's populated — it's voided (empty bye)
          // when the winners-bracket team takes the grand final, and empty before
          // the grand final is played. The reset is the higher-numbered round.
          const finals = playoffMatches.slice().sort((a, b) => a.round - b.round);
          const visibleFinals = finals.filter((m, i) => i === 0 || !!m.entryAId || !!m.entryBId);
          if (visibleFinals.length === 0) return null;
          const resetRound = finals.length > 1 ? finals[finals.length - 1]!.round : null;
          return (
            <div className="space-y-2">
              <h2 className="text-fg text-base font-semibold">Grand final</h2>
              {renderRoundColumns(visibleFinals, (r) => (r === resetRound ? 'Reset' : 'Final'))}
            </div>
          );
        })()}

      {!isDoubleElim && (otherMatches.length > 0 || playoffMatches.length > 0) && (
        <div className="space-y-2">
          {isPoolPlay && playoffMatches.length > 0 && (
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-fg text-base font-semibold">Playoff</h2>
              {canReseedPlayoff && playoffSeedTeams.length >= 2 && (
                <ReseedPlayoffButton scope={scope} orderedTeams={playoffSeedTeams} />
              )}
            </div>
          )}
          {canAddGame && props.format === 'round_robin' && (
            <div className="flex justify-end">
              <AddMatchButton scope={scope} teams={teams} label="+ Add game" />
            </div>
          )}
          {renderRoundColumns([...otherMatches, ...playoffMatches])}
        </div>
      )}
    </section>
  );
}

function PoolsView(props: {
  scope: BracketScope;
  eventId?: string;
  divisionId?: string;
  matches: ReadonlyArray<Match>;
  teamById: ReadonlyMap<string, TeamLite>;
  /** Deduped registered teams — drives the per-pool "Add game" picker. */
  teams?: ReadonlyArray<TeamLite>;
  bestOf: number;
  targetScore?: number | null;
  isHost: boolean;
  viewerId: string | null;
  highlightMatchId: string | null;
  liveScoringEnabled?: boolean;
  /** Renders the host structural-edit affordance under each match (ADR 0032). */
  hostEdit?: (m: Match) => ReactNode;
  /** Host may append a game to a pool on the live board (ADR 0032). */
  canAddGame?: boolean;
}) {
  const pools = distinctPools(props.matches);
  const allTeams = props.teams ?? [];
  return (
    <div className="space-y-6">
      {pools.map((pool) => {
        const poolMatches = props.matches.filter((m) => m.pool === pool);
        const standings = computePoolStandings(props.matches, pool);
        const sortedPoolMatches = poolMatches
          .slice()
          .sort((a, b) => a.round - b.round || a.matchNumber - b.matchNumber);
        const orderedIds = sortedPoolMatches.map((m) => String(m.id));
        // Reorder is allowed when the host hasn't started any pool match.
        const canReorder =
          props.isHost && poolMatches.every((m) => m.status === 'pending' || m.status === 'bye');
        // "Add game" offers the teams already in this pool (fallback: all teams).
        const poolEntryIds = new Set<string>();
        for (const m of poolMatches) {
          if (m.entryAId) poolEntryIds.add(m.entryAId);
          if (m.entryBId) poolEntryIds.add(m.entryBId);
        }
        const poolTeams = allTeams.filter((t) => poolEntryIds.has(t.entryId));
        return (
          <div key={pool} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-fg text-base font-semibold">Pool {pool}</h2>
              {props.canAddGame && (
                <AddMatchButton
                  scope={props.scope}
                  pool={pool}
                  teams={poolTeams.length > 0 ? poolTeams : allTeams}
                  label="+ Add game"
                />
              )}
            </div>
            <PoolStandingsTable standings={standings} teamById={props.teamById} />
            <div className="flex flex-wrap gap-2">
              {sortedPoolMatches.map((m, i) => {
                const isHighlighted = props.highlightMatchId === String(m.id);
                return (
                  <div
                    key={m.id}
                    id={`match-${String(m.id)}`}
                    className={`rounded-shape-sm min-w-55 scroll-mt-24 ${isHighlighted ? 'ring-primary ring-2 ring-offset-2 ring-offset-transparent' : ''}`}
                  >
                    {canReorder && (
                      <ReorderControls
                        scope={props.scope}
                        pool={pool}
                        matchId={String(m.id)}
                        orderedIds={orderedIds}
                        canMoveUp={i > 0}
                        canMoveDown={i < sortedPoolMatches.length - 1}
                      />
                    )}
                    <MatchCard
                      scope={props.scope}
                      {...(props.eventId ? { eventId: props.eventId } : {})}
                      {...(props.divisionId ? { divisionId: props.divisionId } : {})}
                      match={m}
                      teamById={props.teamById}
                      bestOf={props.bestOf}
                      targetScore={props.targetScore ?? null}
                      isHost={props.isHost}
                      viewerId={props.viewerId}
                      liveScoringEnabled={props.liveScoringEnabled ?? false}
                    />
                    {props.hostEdit?.(m)}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReorderControls(props: {
  scope: BracketScope;
  pool: string;
  matchId: string;
  orderedIds: ReadonlyArray<string>;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const action = bindBracketActions(props.scope).movePoolMatch(props.pool);
  return (
    <div className="text-muted mb-1 flex items-center gap-1 text-xs">
      <span className="mr-1">Order:</span>
      <form action={action}>
        {props.orderedIds.map((id) => (
          <input key={id} type="hidden" name="match_id" value={id} />
        ))}
        <input type="hidden" name="move_id" value={props.matchId} />
        <input type="hidden" name="direction" value="up" />
        <button
          type="submit"
          disabled={!props.canMoveUp}
          aria-label="Move match earlier"
          className="border-border-base tap-target rounded border disabled:opacity-30"
        >
          ↑
        </button>
      </form>
      <form action={action}>
        {props.orderedIds.map((id) => (
          <input key={id} type="hidden" name="match_id" value={id} />
        ))}
        <input type="hidden" name="move_id" value={props.matchId} />
        <input type="hidden" name="direction" value="down" />
        <button
          type="submit"
          disabled={!props.canMoveDown}
          aria-label="Move match later"
          className="border-border-base tap-target rounded border disabled:opacity-30"
        >
          ↓
        </button>
      </form>
    </div>
  );
}

function PoolStandingsTable(props: {
  standings: ReadonlyArray<PoolStanding>;
  teamById: ReadonlyMap<string, TeamLite>;
}) {
  if (props.standings.length === 0) {
    return <p className="text-muted text-xs">No standings yet.</p>;
  }
  return (
    <table className="w-full text-xs">
      <thead className="text-muted">
        <tr className="border-border-base border-b">
          <th scope="col" className="px-2 py-1 text-left">
            #
          </th>
          <th scope="col" className="px-2 py-1 text-left">
            Team
          </th>
          <th scope="col" className="px-2 py-1 text-right">
            W
          </th>
          <th scope="col" className="px-2 py-1 text-right">
            L
          </th>
          <th scope="col" className="px-2 py-1 text-right">
            Set diff
          </th>
          <th scope="col" className="px-2 py-1 text-right">
            Pt diff
          </th>
        </tr>
      </thead>
      <tbody>
        {props.standings.map((s, i) => {
          const team = props.teamById.get(String(s.entryId));
          return (
            <tr key={String(s.entryId)} className="border-border-base/40 border-b">
              <td className="text-muted px-2 py-1 tabular-nums">{i + 1}</td>
              <td className="text-fg px-2 py-1">{team?.name ?? '—'}</td>
              <td className="px-2 py-1 text-right tabular-nums">{s.wins}</td>
              <td className="px-2 py-1 text-right tabular-nums">{s.losses}</td>
              <td className="px-2 py-1 text-right tabular-nums">
                {s.setDiff > 0 ? `+${s.setDiff}` : s.setDiff}
              </td>
              <td className="px-2 py-1 text-right tabular-nums">
                {s.pointDiff > 0 ? `+${s.pointDiff}` : s.pointDiff}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Host-only strip on the live board (ADR 0032 / Phase 5). While `active`:
 * substitute a dropped team. Once `completed`: re-open to fix a result. Per-match
 * matchup / court / length edits live on each card via the "Edit" affordance.
 */
function LiveHostTools(props: {
  scope: BracketScope;
  status: 'active' | 'completed';
  teams: ReadonlyArray<TeamLite>;
}) {
  const a = bindBracketActions(props.scope);
  if (props.status === 'completed') {
    return <ReopenStrip reopen={a.reopen} />;
  }
  return (
    <div className="border-border-base bg-fg/5 rounded-shape-sm flex flex-wrap items-center gap-3 border p-3">
      <span className="text-muted text-xs font-semibold tracking-wide uppercase">Host edits</span>
      <SubstituteTeamButton scope={props.scope} teams={props.teams} />
      <span className="text-muted text-xs">
        Use <span className="text-fg/70">Edit</span> on any match to fix a matchup, court, or match
        length.
      </span>
    </div>
  );
}

/**
 * Completed-bracket "Re-open to edit" strip — shared by the event host tools
 * and the standalone owner board (TT-10). `reopen` is a scope-bound server
 * action (event → reopenBracket, standalone → reopenStandaloneBracket).
 */
function ReopenStrip(props: { reopen: () => void | Promise<void> }) {
  return (
    <div className="border-border-base bg-fg/5 rounded-shape-sm flex flex-wrap items-center gap-3 border p-3">
      <span className="text-muted text-xs font-semibold tracking-wide uppercase">Host edits</span>
      <form action={props.reopen} className="flex items-center gap-2">
        <SubmitButton className={neutralButtonClass('sm')}>Re-open to edit</SubmitButton>
        <span className="text-muted text-xs">
          Re-open this completed bracket to fix a result or matchup.
        </span>
      </form>
    </div>
  );
}

function SubstituteTeamButton(props: { scope: BracketScope; teams: ReadonlyArray<TeamLite> }) {
  const action = bindBracketActions(props.scope).replaceEntryFromForm;
  return (
    <FormModal
      trigger={(open) => (
        <button type="button" onClick={open} className={neutralButtonClass('sm')}>
          Substitute a team
        </button>
      )}
      title="Substitute a team"
      description="Swap a team out for another registered team everywhere it appears — for a drop or no-show. Any recorded results carry over to the substitute."
    >
      {(close) => (
        <form action={action} className="space-y-3">
          <TeamPicker name="old_entry_id" label="Replace" teams={props.teams} />
          <TeamPicker name="new_entry_id" label="With" teams={props.teams} />
          <ModalActions
            dismissive={
              <button type="button" onClick={close} className={neutralButtonClass('sm')}>
                Cancel
              </button>
            }
            confirming={
              <SubmitButton className={primaryButtonClass('sm')}>Substitute</SubmitButton>
            }
          />
        </form>
      )}
    </FormModal>
  );
}

function TeamPicker(props: { name: string; label: string; teams: ReadonlyArray<TeamLite> }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-fg/80">{props.label}</span>
      <select
        name={props.name}
        defaultValue=""
        required
        className="border-border-base bg-bg rounded border px-2 py-1"
      >
        <option value="" disabled>
          Choose a team…
        </option>
        {props.teams.map((t) => (
          <option key={t.entryId} value={t.entryId}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}
