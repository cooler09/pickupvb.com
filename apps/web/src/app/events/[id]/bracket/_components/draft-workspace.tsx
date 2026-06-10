'use client';

import { useMemo, type ReactNode } from 'react';
import type { BracketFormat, Match } from '@pickupvb/domain';
import { FormModal, ModalActions } from '@/components/form-modal';
import { SubmitButton } from '@/components/submit-button';
import {
  neutralButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/primary-button';
import { AddMatchButton } from './add-match-button';
import { bindBracketActions } from './bracket-action-binding';
import { FORMAT_LABEL, type BracketScope, type TeamLite } from './labels';
import { MatchEditor } from './match-editor';

type SeedLite = { entryId: string; seed: number; pool: string | null };

/**
 * The draft-editing workspace (ADR 0032). Rendered while a bracket is in
 * `draft`: the generated schedule exists but isn't live yet, so the host can
 * fully edit it — swap matchups, set court / match length, add or remove pool
 * games, move teams between pools — then **Publish** to go live.
 *
 * Scope-aware (TT-11): the manual-edit actions are bound via `bindBracketActions`
 * so this renders for both event and standalone draft brackets.
 */
export function DraftWorkspace(props: {
  scope: BracketScope;
  format: BracketFormat;
  /** Pool-stage / global default best-of (per-match overrides win). */
  bestOf: number;
  /** Global default target score, or null. */
  targetScore: number | null;
  matches: ReadonlyArray<Match>;
  teams: ReadonlyArray<TeamLite>;
  seeds: ReadonlyArray<SeedLite>;
}) {
  const { scope, matches, teams } = props;
  const a = bindBracketActions(scope);
  const publish = a.publish;
  const regenerate = a.generate;
  const reset = a.reset;

  const teamById = useMemo(() => {
    const m = new Map<string, TeamLite>();
    for (const t of teams) m.set(t.entryId, t);
    return m;
  }, [teams]);

  const isPoolPlay = props.format === 'pool_play_playoff' && matches.some((m) => m.pool !== null);
  const poolMatches = matches.filter((m) => m.pool !== null);
  const pools = useMemo(
    () => Array.from(new Set(poolMatches.map((m) => m.pool!))).sort(),
    [poolMatches],
  );
  // The format allows adding / removing games (pool play & round robin are
  // "free" schedules; elimination brackets are wired and must not lose matches).
  const editableSchedule = props.format === 'pool_play_playoff' || props.format === 'round_robin';

  // A bracket is publishable once every match has both teams or is a bye —
  // pool play / round robin always qualify; elim later rounds fill from feeders.
  const incomplete = matches.filter(
    (m) => m.status !== 'bye' && (!m.entryAId || !m.entryBId) && m.pool !== null,
  ).length;

  const renderMatchRow = (m: Match) => {
    const a = m.entryAId ? teamById.get(m.entryAId)?.name : null;
    const b = m.entryBId ? teamById.get(m.entryBId)?.name : null;
    const bo = m.bestOf ?? props.bestOf;
    return (
      <li
        key={m.id}
        className="border-border-base bg-bg flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm"
      >
        <div className="min-w-0">
          <div className="text-fg truncate">
            <span className={a ? '' : 'text-muted italic'}>{a ?? 'TBD'}</span>
            <span className="text-muted px-1.5">vs</span>
            <span className={b ? '' : 'text-muted italic'}>{b ?? 'TBD'}</span>
          </div>
          <div className="text-muted mt-0.5 text-xs">
            {m.court ? `${m.court} · ` : ''}Best of {bo}
            {m.targetScore
              ? ` · to ${m.targetScore}`
              : props.targetScore
                ? ` · to ${props.targetScore}`
                : ''}
          </div>
        </div>
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
          defaultTargetScore={props.targetScore}
          allowRemove={editableSchedule}
        />
      </li>
    );
  };

  return (
    <section className="space-y-6">
      {/* Publish / readiness card — the primary thing the host does here. */}
      <div className="border-primary/40 bg-primary/5 rounded-shape-sm space-y-3 border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-fg text-sm font-semibold">
              Draft — review and edit before going live
            </p>
            <p className="text-muted text-xs">
              {FORMAT_LABEL[props.format]} · {matches.length} match
              {matches.length === 1 ? '' : 'es'}
              {incomplete > 0 ? ` · ${incomplete} still missing a team` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={publish}>
              <SubmitButton pendingChildren="Publishing…" className={primaryButtonClass('md')}>
                Publish bracket
              </SubmitButton>
            </form>
            <form action={regenerate}>
              <SubmitButton pendingChildren="Regenerating…" className={neutralButtonClass('md')}>
                Regenerate
              </SubmitButton>
            </form>
            <form action={reset}>
              <SubmitButton className={neutralButtonClass('md')}>Discard</SubmitButton>
            </form>
          </div>
        </div>
        <p className="text-muted text-xs">
          Publishing makes scoring live. You can still fix matchups, swap teams, and edit results
          after publishing. <span className="text-fg/70">Regenerate</span> rebuilds the schedule
          from the current seeding and config (discarding manual edits);{' '}
          <span className="text-fg/70">Discard</span> returns to seeding.
        </p>
      </div>

      {isPoolPlay ? (
        <>
          <PoolsEditor scope={scope} pools={pools} seeds={props.seeds} teamById={teamById} />
          {pools.map((pool) => {
            const inPool = poolMatches
              .filter((m) => m.pool === pool)
              .sort((x, y) => x.matchNumber - y.matchNumber);
            const orderedIds = inPool.map((m) => String(m.id));
            const poolTeams = props.seeds
              .filter((s) => s.pool === pool)
              .map((s) => teamById.get(s.entryId))
              .filter((t): t is TeamLite => !!t);
            return (
              <div key={pool} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-fg text-base font-semibold">Pool {pool}</h3>
                  <AddMatchButton
                    scope={scope}
                    pool={pool}
                    teams={poolTeams.length > 0 ? poolTeams : teams}
                  />
                </div>
                <ul className="space-y-2">
                  {inPool.map((m, i) => (
                    <div key={m.id} className="flex items-stretch gap-2">
                      <ReorderControls
                        scope={scope}
                        pool={pool}
                        matchId={String(m.id)}
                        orderedIds={orderedIds}
                        canMoveUp={i > 0}
                        canMoveDown={i < inPool.length - 1}
                      />
                      <div className="flex-1">{renderMatchRow(m)}</div>
                    </div>
                  ))}
                </ul>
              </div>
            );
          })}
        </>
      ) : (
        <RoundsView
          matches={matches}
          renderMatchRow={renderMatchRow}
          addMatch={editableSchedule ? <AddMatchButton scope={scope} teams={teams} /> : null}
        />
      )}
    </section>
  );
}

function RoundsView(props: {
  matches: ReadonlyArray<Match>;
  renderMatchRow: (m: Match) => ReactNode;
  addMatch: ReactNode;
}) {
  const rounds = useMemo(() => {
    const byRound = new Map<number, Match[]>();
    for (const m of props.matches) {
      const list = byRound.get(m.round) ?? [];
      list.push(m);
      byRound.set(m.round, list);
    }
    return Array.from(byRound.entries()).sort((a, b) => a[0] - b[0]);
  }, [props.matches]);
  return (
    <div className="space-y-4">
      {props.addMatch && <div className="flex justify-end">{props.addMatch}</div>}
      {rounds.map(([round, list]) => (
        <div key={round} className="space-y-2">
          <h3 className="text-fg text-base font-semibold">Round {round}</h3>
          <ul className="space-y-2">
            {list
              .slice()
              .sort((a, b) => a.matchNumber - b.matchNumber)
              .map((m) => props.renderMatchRow(m))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Bulk pool reassignment behind a modal: one select per team, one rebuild. */
function PoolsEditor(props: {
  scope: BracketScope;
  pools: ReadonlyArray<string>;
  seeds: ReadonlyArray<SeedLite>;
  teamById: ReadonlyMap<string, TeamLite>;
}) {
  const action = bindBracketActions(props.scope).setPoolsFromForm;
  // Offer the existing pools plus one fresh label so the host can split further.
  const nextLabel = String.fromCharCode(65 + props.pools.length);
  const poolOptions = [...props.pools, nextLabel];
  return (
    <FormModal
      trigger={(open) => (
        <button type="button" onClick={open} className={secondaryButtonClass('sm')}>
          Edit pools
        </button>
      )}
      title="Assign teams to pools"
      description="Move teams between pools — pools can be uneven. Saving rebuilds the pool schedule from the new composition."
      size="lg"
    >
      {(close) => (
        <form action={action} className="space-y-3">
          <ul className="divide-border-base/60 divide-y">
            {props.seeds.map((s) => {
              const name = props.teamById.get(s.entryId)?.name ?? 'Team';
              return (
                <li
                  key={s.entryId}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="text-fg truncate">{name}</span>
                  <select
                    name={`team_pool_${s.entryId}`}
                    defaultValue={s.pool ?? props.pools[0] ?? 'A'}
                    className="border-border-base bg-bg rounded border px-2 py-1"
                  >
                    {poolOptions.map((p) => (
                      <option key={p} value={p}>
                        Pool {p}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
          <ModalActions
            dismissive={
              <button type="button" onClick={close} className={neutralButtonClass('sm')}>
                Cancel
              </button>
            }
            confirming={
              <SubmitButton className={primaryButtonClass('sm')}>Save &amp; rebuild</SubmitButton>
            }
          />
        </form>
      )}
    </FormModal>
  );
}

/** Up / down reorder for a pool match (reuses movePoolMatch — ADR 0018). */
function ReorderControls(props: {
  scope: BracketScope;
  pool: string;
  matchId: string;
  orderedIds: ReadonlyArray<string>;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const action = bindBracketActions(props.scope).movePoolMatch(props.pool);
  const hidden = (
    <>
      {props.orderedIds.map((id) => (
        <input key={id} type="hidden" name="match_id" value={id} />
      ))}
      <input type="hidden" name="move_id" value={props.matchId} />
    </>
  );
  return (
    <div className="text-muted flex flex-col justify-center gap-1">
      <form action={action}>
        {hidden}
        <input type="hidden" name="direction" value="up" />
        <button
          type="submit"
          disabled={!props.canMoveUp}
          aria-label="Move match earlier"
          className="border-border-base block rounded border px-1.5 leading-none disabled:opacity-30"
        >
          ↑
        </button>
      </form>
      <form action={action}>
        {hidden}
        <input type="hidden" name="direction" value="down" />
        <button
          type="submit"
          disabled={!props.canMoveDown}
          aria-label="Move match later"
          className="border-border-base block rounded border px-1.5 leading-none disabled:opacity-30"
        >
          ↓
        </button>
      </form>
    </div>
  );
}
