'use client';

import { useState } from 'react';
import { primaryButtonClass } from '@/components/primary-button';
import type { BracketFormat } from '@pickupvb/domain';
import { SubmitButton } from '@/components/submit-button';
import { createBracketFromForm } from '../actions';

/**
 * Card-based picker that replaces the bare `<select>` for choosing a
 * bracket format. Each card carries the format name, a one-line
 * description, a "best for" line, and the main trade-off so the host
 * can choose informed instead of guessing. The pool-play extra controls
 * (pool count, advance-per-pool) collapse in unless that format is
 * selected, and a live "estimated matches" hint updates as the host
 * changes selection.
 */

type FormatMeta = {
  value: BracketFormat;
  title: string;
  blurb: string;
  bestFor: string;
  tradeoff: string;
  minTeams: number;
};

/**
 * Tiny inline-SVG sketch of each bracket shape. Pure decoration — no text,
 * no accessibility content (the format title + description carry the
 * meaning, and `aria-hidden` keeps screen readers from announcing the
 * graphic). 80×40 viewbox sized so it sits neatly above the format name
 * without crowding the description text.
 */
function FormatThumbnail({ format }: { format: BracketFormat }) {
  const stroke = 'currentColor';
  const sw = 1.25;
  switch (format) {
    case 'single_elimination':
      // 4 teams → 2 semis → 1 final, classic right-pointing tree.
      return (
        <svg
          viewBox="0 0 80 40"
          width={64}
          height={32}
          aria-hidden="true"
          className="text-primary/70"
          fill="none"
        >
          <path d="M4 6 H22 M4 14 H22 M4 26 H22 M4 34 H22" stroke={stroke} strokeWidth={sw} />
          <path
            d="M22 6 V10 H38 V18 M22 14 V10 M22 26 V30 H38 V22 M22 34 V30 M38 18 V20 H60 V20 M38 22 V20"
            stroke={stroke}
            strokeWidth={sw}
          />
          <path d="M60 20 H76" stroke={stroke} strokeWidth={sw} />
        </svg>
      );
    case 'double_elimination':
      // Winners tree on top, losers tree on bottom, both feeding the right.
      return (
        <svg
          viewBox="0 0 80 40"
          width={64}
          height={32}
          aria-hidden="true"
          className="text-primary/70"
          fill="none"
        >
          {/* Winners bracket */}
          <path d="M4 4 H18 M4 10 H18" stroke={stroke} strokeWidth={sw} />
          <path d="M18 4 V7 H34 V13 M18 10 V7" stroke={stroke} strokeWidth={sw} />
          <path d="M34 13 H58" stroke={stroke} strokeWidth={sw} />
          {/* Losers bracket */}
          <path d="M4 28 H18 M4 36 H18" stroke={stroke} strokeWidth={sw} />
          <path d="M18 28 V32 H34 V26 M18 36 V32" stroke={stroke} strokeWidth={sw} />
          <path d="M34 26 H58" stroke={stroke} strokeWidth={sw} />
          {/* Grand final on the right */}
          <path d="M58 13 V20 H72 V20 M58 26 V20" stroke={stroke} strokeWidth={sw} />
        </svg>
      );
    case 'round_robin':
      // Four nodes in a square, every pair connected.
      return (
        <svg
          viewBox="0 0 80 40"
          width={64}
          height={32}
          aria-hidden="true"
          className="text-primary/70"
          fill="none"
        >
          {(() => {
            const pts = [
              { x: 20, y: 8 },
              { x: 60, y: 8 },
              { x: 60, y: 32 },
              { x: 20, y: 32 },
            ];
            const edges = [];
            for (let i = 0; i < pts.length; i++) {
              for (let j = i + 1; j < pts.length; j++) {
                edges.push(
                  <line
                    key={`${i}-${j}`}
                    x1={pts[i]!.x}
                    y1={pts[i]!.y}
                    x2={pts[j]!.x}
                    y2={pts[j]!.y}
                    stroke={stroke}
                    strokeWidth={sw}
                  />,
                );
              }
            }
            return (
              <>
                {edges}
                {pts.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={3} fill={stroke} />
                ))}
              </>
            );
          })()}
        </svg>
      );
    case 'pool_play_playoff':
      // Two pools (4 dots stacked) on the left, arrow into a 2-round tree.
      return (
        <svg
          viewBox="0 0 80 40"
          width={64}
          height={32}
          aria-hidden="true"
          className="text-primary/70"
          fill="none"
        >
          {/* Pool A */}
          <rect x={3} y={3} width={20} height={14} rx={2} stroke={stroke} strokeWidth={sw} />
          {[7, 13, 19].map((x, i) => (
            <circle key={`a-${i}`} cx={x} cy={10} r={1.5} fill={stroke} />
          ))}
          {/* Pool B */}
          <rect x={3} y={23} width={20} height={14} rx={2} stroke={stroke} strokeWidth={sw} />
          {[7, 13, 19].map((x, i) => (
            <circle key={`b-${i}`} cx={x} cy={30} r={1.5} fill={stroke} />
          ))}
          {/* Playoff bracket on the right */}
          <path d="M30 10 H44 M30 30 H44" stroke={stroke} strokeWidth={sw} />
          <path d="M44 10 V20 H60 M44 30 V20" stroke={stroke} strokeWidth={sw} />
          <path d="M60 20 H76" stroke={stroke} strokeWidth={sw} />
        </svg>
      );
  }
}

const FORMATS: ReadonlyArray<FormatMeta> = [
  {
    value: 'single_elimination',
    title: 'Single elimination',
    blurb: 'Lose once and you’re out. Half the field drops every round.',
    bestFor: 'Tight schedules, large fields, "win to advance" energy.',
    tradeoff: 'One bad set ends your day — no chance to recover.',
    minTeams: 2,
  },
  {
    value: 'double_elimination',
    title: 'Double elimination',
    blurb: 'Lose once and you drop to a losers bracket; lose twice and you’re out.',
    bestFor: 'Most competitive tournaments — every team plays ≥ 2 matches.',
    tradeoff:
      'About twice the matches of single-elim — needs more court time. Any field of 4+ works ' +
      '(odd sizes get byes); the grand final resets if the losers-bracket team wins.',
    minTeams: 4,
  },
  {
    value: 'round_robin',
    title: 'Round robin',
    blurb: 'Every team plays every other team once. Standings decide it.',
    bestFor: 'Small fields (≤ 6) where everyone wants maximum play.',
    tradeoff: 'Match count grows fast (n × (n − 1) / 2). No clean "final".',
    minTeams: 3,
  },
  {
    value: 'pool_play_playoff',
    title: 'Pool play → playoff',
    blurb: 'Round-robin inside pools, then a single-elim playoff of the top finishers.',
    bestFor: 'Large fields that want guaranteed matches + a real bracket finish.',
    tradeoff: 'Most complex schedule; needs at least 2 teams per pool.',
    minTeams: 4,
  },
];

function estimateMatches(
  format: BracketFormat,
  teams: number,
  poolCount: number,
  advancePerPool: number,
  poolSchedule: 'round_robin' | 'fixed_games',
  poolGamesPerTeam: number,
): number | null {
  if (teams < 2) return null;
  switch (format) {
    case 'single_elimination':
      return teams - 1;
    case 'double_elimination':
      // Approx: winners (n−1) + losers (n−1) + grand final (1, sometimes 2).
      return 2 * (teams - 1) + 1;
    case 'round_robin':
      return (teams * (teams - 1)) / 2;
    case 'pool_play_playoff': {
      const perPool = Math.floor(teams / poolCount);
      if (perPool < 2) return null;
      let poolMatches: number;
      if (poolSchedule === 'fixed_games') {
        // Target-games (ADR 0032): everyone plays ~g games, opponents repeat
        // in small pools. Total team-games = teams * g → matches ≈ teams*g/2.
        const g = Math.max(1, poolGamesPerTeam);
        poolMatches = Math.round((teams * g) / 2);
      } else {
        poolMatches = poolCount * ((perPool * (perPool - 1)) / 2);
      }
      const playoffTeams = Math.min(advancePerPool * poolCount, teams);
      const playoffMatches = Math.max(0, playoffTeams - 1);
      return poolMatches + playoffMatches;
    }
  }
}

export function FormatPickerForm(props: {
  eventId?: string;
  divisionId?: string;
  teamCount: number;
  /**
   * Override the create action. Standalone create (ADR 0025) posts to
   * `createStandaloneBracketFromForm` (no scope yet); the event path defaults
   * to `createBracketFromForm` bound to eventId/divisionId.
   */
  action?: (formData: FormData) => void | Promise<void>;
  /** Standalone create has no teams yet — relax the min-team gating. */
  enforceMinTeams?: boolean;
}) {
  const enforceMin = props.enforceMinTeams ?? true;
  const [format, setFormat] = useState<BracketFormat>('single_elimination');
  const [bestOf, setBestOf] = useState<1 | 3 | 5>(3);
  // Target score = the points a game is played to (25 / 21 / 15). Informational
  // (ADR 0032). Defaults to 25 (standard); '' means "don't record one".
  const [targetScore, setTargetScore] = useState<number | ''>(25);
  const [poolCount, setPoolCount] = useState(2);
  const [advancePerPool, setAdvancePerPool] = useState(2);
  const [poolSchedule, setPoolSchedule] = useState<'round_robin' | 'fixed_games'>('round_robin');
  const [poolGamesPerTeam, setPoolGamesPerTeam] = useState(3);
  // Playoff-stage overrides (pool_play_playoff only). '' = same as pool play.
  const [playoffBestOf, setPlayoffBestOf] = useState<'' | 1 | 3 | 5>('');
  const [playoffTargetScore, setPlayoffTargetScore] = useState<number | ''>('');
  const [requireWorkTeam, setRequireWorkTeam] = useState(false);
  const [courtLabelsText, setCourtLabelsText] = useState('');
  const [perPoolCourts, setPerPoolCourts] = useState(false);
  const [poolCourtsText, setPoolCourtsText] = useState<Record<string, string>>({});

  const isPoolPlay = format === 'pool_play_playoff';
  const isFixedGames = isPoolPlay && poolSchedule === 'fixed_games';
  const selectedMeta = FORMATS.find((f) => f.value === format)!;
  const belowMin = props.teamCount < selectedMeta.minTeams;
  const teamsPerPool = isPoolPlay ? Math.floor(props.teamCount / poolCount) : 0;
  const estimate = estimateMatches(
    format,
    props.teamCount,
    poolCount,
    advancePerPool,
    poolSchedule,
    poolGamesPerTeam,
  );
  // Snake distribution gives the smallest pool floor(teams / pools) teams,
  // so advancing N from each pool requires teams >= pools * advancePerPool.
  // The domain enforces this at generate() time; mirror it here so the host
  // doesn't ship a config that's guaranteed to fail later.
  const poolPlayUnderfilled =
    isPoolPlay && props.teamCount > 0 && advancePerPool * poolCount > props.teamCount;

  return (
    <form
      action={props.action ?? createBracketFromForm.bind(null, props.eventId!, props.divisionId!)}
      className="space-y-4"
    >
      <fieldset className="space-y-2">
        <legend className="text-fg/80 text-sm font-medium">Format</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {FORMATS.map((f) => {
            const selected = format === f.value;
            const disabled = props.teamCount > 0 && props.teamCount < f.minTeams;
            return (
              <label
                key={f.value}
                className={
                  'rounded-shape-sm relative block cursor-pointer border p-3 text-sm transition ' +
                  (selected
                    ? 'border-primary bg-primary/5 ring-primary/30 ring-2'
                    : 'border-border-base bg-bg hover:border-primary/40') +
                  (disabled ? ' cursor-not-allowed opacity-50' : '')
                }
              >
                <input
                  type="radio"
                  name="format"
                  value={f.value}
                  checked={selected}
                  onChange={() => setFormat(f.value)}
                  disabled={disabled}
                  className="sr-only"
                />
                <div className="flex items-start gap-3">
                  <div className="border-border-base bg-bg shrink-0 rounded border p-1">
                    <FormatThumbnail format={f.value} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-fg font-semibold">{f.title}</div>
                    <p className="text-fg/80 mt-1">{f.blurb}</p>
                  </div>
                </div>
                <dl className="text-muted mt-2 space-y-0.5 text-xs">
                  <div>
                    <dt className="text-fg/70 inline font-medium">Best for: </dt>
                    <dd className="inline">{f.bestFor}</dd>
                  </div>
                  <div>
                    <dt className="text-fg/70 inline font-medium">Trade-off: </dt>
                    <dd className="inline">{f.tradeoff}</dd>
                  </div>
                  <div>
                    <dt className="text-fg/70 inline font-medium">Min teams: </dt>
                    <dd className="inline">{f.minTeams}</dd>
                  </div>
                </dl>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="border-border-base bg-bg flex flex-wrap items-center gap-3 rounded border p-3">
        <legend className="text-fg/80 px-1 text-xs font-medium">
          {isPoolPlay ? 'Pool play match length' : 'Match length'}
        </legend>
        <div role="radiogroup" aria-label="Best of" className="flex flex-wrap gap-2">
          {([1, 3, 5] as const).map((n) => {
            const selected = bestOf === n;
            return (
              <label
                key={n}
                className={
                  'cursor-pointer rounded border px-3 py-1 text-sm transition ' +
                  (selected
                    ? 'border-primary bg-primary/10 text-fg'
                    : 'border-border-base bg-bg text-fg/80 hover:border-primary/40')
                }
              >
                <input
                  type="radio"
                  name="best_of"
                  value={n}
                  checked={selected}
                  onChange={() => setBestOf(n)}
                  className="sr-only"
                />
                Best of {n}
              </label>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-fg/80">Play to</span>
          <input
            type="number"
            name="target_score"
            min={1}
            value={targetScore}
            onChange={(e) =>
              setTargetScore(e.target.value === '' ? '' : Math.max(1, Number(e.target.value) || 0))
            }
            placeholder="25"
            className="border-border-base bg-bg w-20 rounded border px-2 py-1"
          />
          <span className="text-muted text-xs">points</span>
        </label>
        <p className="text-muted basis-full text-xs">
          {bestOf === 1
            ? 'Single game decides each match — fastest schedule.'
            : `First to ${Math.floor(bestOf / 2) + 1} sets wins each match.`}{' '}
          The point total is recorded for reference (not enforced).
        </p>
      </fieldset>

      {isPoolPlay && (
        <fieldset className="border-border-base bg-bg flex flex-wrap items-end gap-3 rounded border p-3">
          <legend className="text-fg/80 px-1 text-xs font-medium">Pool play options</legend>
          <label className="flex flex-col text-sm">
            <span className="text-fg/80">Pools</span>
            <select
              name="pool_count"
              value={poolCount}
              onChange={(e) => setPoolCount(Number(e.target.value))}
              className="border-border-base bg-bg rounded border px-2 py-1"
            >
              {[2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm">
            <span className="text-fg/80">Advance per pool</span>
            <select
              name="advance_per_pool"
              value={advancePerPool}
              onChange={(e) => setAdvancePerPool(Number(e.target.value))}
              className="border-border-base bg-bg rounded border px-2 py-1"
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="basis-full" />
          <div role="radiogroup" aria-label="Pool schedule" className="flex flex-col gap-1 text-sm">
            <span className="text-fg/80">Schedule</span>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { v: 'round_robin', label: 'Every team plays every other' },
                  { v: 'fixed_games', label: 'Each team plays N games' },
                ] as const
              ).map((opt) => {
                const selected = poolSchedule === opt.v;
                return (
                  <label
                    key={opt.v}
                    className={
                      'cursor-pointer rounded border px-3 py-1 text-sm transition ' +
                      (selected
                        ? 'border-primary bg-primary/10 text-fg'
                        : 'border-border-base bg-bg text-fg/80 hover:border-primary/40')
                    }
                  >
                    <input
                      type="radio"
                      name="pool_schedule"
                      value={opt.v}
                      checked={selected}
                      onChange={() => setPoolSchedule(opt.v)}
                      className="sr-only"
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          </div>
          {isFixedGames && (
            <label className="flex flex-col text-sm">
              <span className="text-fg/80">Games per team</span>
              <input
                type="number"
                name="pool_games_per_team"
                min={1}
                value={poolGamesPerTeam}
                onChange={(e) => setPoolGamesPerTeam(Math.max(1, Number(e.target.value) || 1))}
                className="border-border-base bg-bg w-20 rounded border px-2 py-1"
              />
              <span className="text-muted mt-1 max-w-60 text-xs">
                Everyone plays about this many games. In small or uneven pools, opponents repeat so
                each team still gets a full slate.
              </span>
            </label>
          )}
          <label className="inline-flex basis-full items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="require_work_team"
              checked={requireWorkTeam}
              onChange={(e) => setRequireWorkTeam(e.target.checked)}
              className="border-border-base bg-bg rounded border"
            />
            <span className="text-fg/80">
              Assign a ref / work team per match (the idle team in each pool round)
            </span>
          </label>
          <label className="flex basis-full flex-col text-sm">
            <span className="text-fg/80">Courts (comma-separated, optional)</span>
            <input
              type="text"
              name="court_labels"
              value={courtLabelsText}
              onChange={(e) => setCourtLabelsText(e.target.value)}
              placeholder="Court 1, Court 2, North gym"
              className="border-border-base bg-bg rounded border px-2 py-1"
            />
            <span className="text-muted mt-1 text-xs">
              When set, matches are split into parallel time-slots so no team plays or refs on two
              courts at once. Leave blank to skip slot scheduling.
            </span>
          </label>
          <label className="inline-flex basis-full items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={perPoolCourts}
              onChange={(e) => setPerPoolCourts(e.target.checked)}
              className="border-border-base bg-bg rounded border"
            />
            <span className="text-fg/80">Use different courts per pool</span>
          </label>
          {perPoolCourts && (
            <div className="basis-full space-y-2">
              {Array.from({ length: poolCount }, (_, i) => {
                const label = String.fromCharCode(65 + i);
                const value = poolCourtsText[label] ?? '';
                return (
                  <label key={label} className="flex flex-col text-sm">
                    <span className="text-fg/80">Pool {label} courts</span>
                    <input
                      type="text"
                      name={`pool_courts_${label}`}
                      value={value}
                      onChange={(e) =>
                        setPoolCourtsText((prev) => ({ ...prev, [label]: e.target.value }))
                      }
                      placeholder={`e.g. Court ${i * 2 + 1}, Court ${i * 2 + 2}`}
                      className="border-border-base bg-bg rounded border px-2 py-1"
                    />
                  </label>
                );
              })}
              <p className="text-muted text-xs">
                Leave a pool blank to fall back to the bracket-wide courts above. Disjoint per-pool
                courts schedule fully in parallel.
              </p>
            </div>
          )}
          {/* Playoff-stage match length (ADR 0032) — overrides the pool-play
              best-of / play-to for the single-elim playoff bracket. */}
          <div className="border-border-base/60 basis-full border-t pt-3">
            <p className="text-fg/80 mb-2 text-xs font-medium">Playoff match length</p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-fg/80">Best of</span>
                <select
                  name="playoff_best_of"
                  value={playoffBestOf}
                  onChange={(e) =>
                    setPlayoffBestOf(
                      e.target.value === '' ? '' : (Number(e.target.value) as 1 | 3 | 5),
                    )
                  }
                  className="border-border-base bg-bg rounded border px-2 py-1"
                >
                  <option value="">Same as pool play</option>
                  {[1, 3, 5].map((n) => (
                    <option key={n} value={n}>
                      Best of {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-fg/80">Play to</span>
                <input
                  type="number"
                  name="playoff_target_score"
                  min={1}
                  value={playoffTargetScore}
                  onChange={(e) =>
                    setPlayoffTargetScore(
                      e.target.value === '' ? '' : Math.max(1, Number(e.target.value) || 0),
                    )
                  }
                  placeholder="Same"
                  className="border-border-base bg-bg w-24 rounded border px-2 py-1"
                />
              </label>
            </div>
            <p className="text-muted mt-1 text-xs">
              Leave “Same as pool play” to reuse the pool-play length for the playoff too. A common
              setup is best-of-1 pool play, best-of-3 playoff.
            </p>
          </div>
          <p className="text-muted basis-full text-xs">
            With {props.teamCount} teams in {poolCount} pools, that’s ~{teamsPerPool} per pool. The
            top {advancePerPool} from each pool advance to a single-elim playoff.
          </p>
          {poolPlayUnderfilled && (
            <p className="basis-full text-xs text-red-600 dark:text-red-400" role="alert">
              {poolCount} pools advancing {advancePerPool} per pool needs at least{' '}
              {poolCount * advancePerPool} teams; you have {props.teamCount}. Reduce pools or
              advance-per-pool, or wait for more teams to register.
            </p>
          )}
        </fieldset>
      )}

      {/* Hidden inputs ensure pool fields are always submitted (server reads them
          unconditionally); when pool-play isn't selected the values are harmless. */}
      {!isPoolPlay && (
        <>
          <input type="hidden" name="pool_count" value={poolCount} />
          <input type="hidden" name="advance_per_pool" value={advancePerPool} />
          <input type="hidden" name="pool_schedule" value={poolSchedule} />
          <input type="hidden" name="pool_games_per_team" value={poolGamesPerTeam} />
        </>
      )}

      <div className="border-border-base bg-bg rounded-shape-sm sticky bottom-2 z-10 flex flex-wrap items-center gap-3 border p-3 shadow-sm">
        <SubmitButton
          disabled={enforceMin && (props.teamCount < 2 || belowMin || poolPlayUnderfilled)}
          className={primaryButtonClass('md')}
        >
          Create bracket
        </SubmitButton>
        {estimate !== null && (
          <span className="text-fg/80 text-sm">
            ~<span className="font-semibold">{estimate}</span> match
            {estimate === 1 ? '' : 'es'} with {props.teamCount} team
            {props.teamCount === 1 ? '' : 's'}.
          </span>
        )}
        {enforceMin && props.teamCount < 2 && (
          <span className="text-muted text-xs">
            Need at least 2 registered teams to create a bracket.
          </span>
        )}
        {enforceMin && props.teamCount >= 2 && belowMin && (
          <span className="text-xs text-red-600 dark:text-red-400">
            {selectedMeta.title} needs at least {selectedMeta.minTeams} teams.
          </span>
        )}
      </div>
    </form>
  );
}
