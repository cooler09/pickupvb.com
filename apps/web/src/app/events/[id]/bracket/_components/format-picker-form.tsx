'use client';

import { useState } from 'react';
import { neutralButtonClass, primaryButtonClass } from '@/components/primary-button';
import type { BracketFormat } from '@pickupvb/domain';
import { SubmitButton } from '@/components/submit-button';
import { FormModal } from '@/components/form-modal';
import { createBracketFromForm } from '../actions';
import { eventScope } from './bracket-action-binding';
import type { TeamLite } from './labels';
import { WalkInTeamForm } from './walk-in-team-form';

/**
 * Card-based picker that replaces the bare `<select>` for choosing a
 * bracket format. Each card carries the format name, a one-line
 * description, a "best for" line, and the main trade-off so the host
 * can choose informed instead of guessing.
 *
 * The whole thing is wired as a **stepper** so building a bracket — pool
 * play especially — is a guided, one-decision-at-a-time flow rather than a
 * single wall of controls: Format → Match length → (Pools, pool-play only)
 * → Review & create. It stays a single `<form>` so the server action and
 * its config parsing are untouched; inactive steps are kept mounted (via the
 * `hidden` attribute) so every field still submits regardless of which step
 * is on screen. A live "estimated matches" hint shows on the review step.
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
    blurb: 'Round-robin inside one or more pools, then a single-elim playoff of the top finishers.',
    bestFor: 'A single pool or several — guaranteed pool matches plus a real bracket finish.',
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

/**
 * Standard per-game target scores for a best-of-N (ADR 0032): every game to 25
 * except the deciding game to 15 (e.g. best-of-3 → `[25, 25, 15]`). Best-of-1 is
 * a single game to 25. The host can edit any game in the setup form.
 */
function defaultGameTargets(bestOf: number): Array<number | ''> {
  return Array.from({ length: Math.max(1, bestOf) }, (_, i) =>
    bestOf > 1 && i === bestOf - 1 ? 15 : 25,
  );
}

/** Join the per-game targets for a compact recap, e.g. `25 / 25 / 15`. */
function formatGameTargets(targets: ReadonlyArray<number | ''>): string {
  return targets.map((t) => (t === '' ? '–' : t)).join(' / ');
}

/**
 * A "play to" number box per game in a best-of-N, submitting `${namePrefix}_1`,
 * `${namePrefix}_2`, … so the server can rebuild the per-game array. A blank box
 * records no target for that game (informational only — ADR 0032).
 */
function PerGameTargets(props: {
  namePrefix: string;
  targets: ReadonlyArray<number | ''>;
  onChange: (index: number, value: number | '') => void;
}) {
  const single = props.targets.length <= 1;
  return (
    <div className="flex flex-wrap items-end gap-2">
      {props.targets.map((t, i) => (
        <label key={i} className="flex flex-col text-sm">
          <span className="text-muted text-xs">{single ? 'Play to' : `Game ${i + 1}`}</span>
          <input
            type="number"
            name={`${props.namePrefix}_${i + 1}`}
            min={1}
            value={t}
            onChange={(e) =>
              props.onChange(
                i,
                e.target.value === '' ? '' : Math.max(1, Number(e.target.value) || 0),
              )
            }
            placeholder="25"
            className="border-border-base bg-bg w-16 rounded border px-2 py-1"
          />
        </label>
      ))}
    </div>
  );
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
  /**
   * Registered teams for the event path. When provided, the stepper opens with
   * a "Teams" step where the host confirms the registered list and adds any
   * walk-in / off-site teams before choosing a format. Standalone create
   * (ADR 0025) omits this — its teams are added after the bracket exists.
   */
  registeredTeams?: ReadonlyArray<TeamLite>;
}) {
  const enforceMin = props.enforceMinTeams ?? true;
  // The event path (registered teams provided) can offer "All teams advance":
  // the team count is knowable before submit even when it's 0 at mount — teams
  // register, or the host adds walk-ins in the Teams step, before creating. Key
  // the 'all' default/option on the path, NOT the live count, so opening the
  // builder early still defaults to all. Standalone create adds teams only after
  // the bracket exists, so it can't resolve 'all' and falls back to a number.
  const canAdvanceAll = props.registeredTeams !== undefined;
  const [step, setStep] = useState(0);
  const [format, setFormat] = useState<BracketFormat>('single_elimination');
  const [bestOf, setBestOf] = useState<1 | 2 | 3 | 4 | 5>(3);
  // Pool-stage scoring mode (ADR 0040). `total_games` = play all `bestOf` games,
  // both count, a 1-1 split is a tie. Only meaningful for pool-bearing formats.
  const [poolPlayMode, setPoolPlayMode] = useState<'best_of' | 'total_games'>('best_of');
  // Per-game target scores (ADR 0032) — one "play to" per game, e.g. [25, 25, 15].
  // Resized to the chosen best-of; '' on a game means "don't record one".
  const [targetScores, setTargetScores] = useState<Array<number | ''>>(() => defaultGameTargets(3));
  // Default to a single pool that seeds a playoff (the common rec case).
  const [poolCount, setPoolCount] = useState(1);
  // Advance selection: 'all' ⇒ every team makes the playoff (resolved to a
  // concrete count at submit from the team count); otherwise the numeric pick.
  const [advanceSel, setAdvanceSel] = useState<string>(() => (canAdvanceAll ? 'all' : '2'));
  const [poolSchedule, setPoolSchedule] = useState<'round_robin' | 'fixed_games'>('round_robin');
  const [poolGamesPerTeam, setPoolGamesPerTeam] = useState(3);
  // Playoff-stage overrides (pool_play_playoff only). '' best-of = same as pool
  // play (then no per-game playoff boxes show and the pool length is reused).
  const [playoffBestOf, setPlayoffBestOf] = useState<'' | 1 | 3 | 5>('');
  const [playoffTargetScores, setPlayoffTargetScores] = useState<Array<number | ''>>([]);
  const [requireWorkTeam, setRequireWorkTeam] = useState(false);
  // Per-pool court lists keyed by pool label (A, B, …) — each pool owns its
  // courts. Empty list ⇒ that pool isn't slot-scheduled.
  const [poolCourts, setPoolCourts] = useState<Record<string, string[]>>({});

  // Update one game's target within a per-game array (immutable replace).
  const setTargetAt = (index: number, value: number | '') =>
    setTargetScores((prev) => prev.map((v, i) => (i === index ? value : v)));
  const setPlayoffTargetAt = (index: number, value: number | '') =>
    setPlayoffTargetScores((prev) => prev.map((v, i) => (i === index ? value : v)));
  // Changing best-of resets the per-game targets to the standard pattern for the
  // new length (25 … / 15 decider) — the old per-game values no longer line up.
  const chooseBestOf = (n: 1 | 3 | 5) => {
    setPoolPlayMode('best_of');
    setBestOf(n);
    setTargetScores(defaultGameTargets(n));
  };
  // "Play all N games, both count" (total_games). Fixes the pool match length at
  // N games (2) and forces a real playoff best-of (the playoff must still
  // resolve a winner, so it can't reuse the even pool length).
  const chooseTotalGames = (n: 2 | 4) => {
    setPoolPlayMode('total_games');
    setBestOf(n);
    // Both games count (no deciding short game), so every game is to 25.
    setTargetScores(Array.from({ length: n }, () => 25));
    setPlayoffBestOf((prev) => (prev === '' ? 3 : prev));
    setPlayoffTargetScores((prev) => (prev.length === 0 ? defaultGameTargets(3) : prev));
  };
  const choosePlayoffBestOf = (n: '' | 1 | 3 | 5) => {
    setPlayoffBestOf(n);
    setPlayoffTargetScores(n === '' ? [] : defaultGameTargets(n));
  };
  // Add / remove a court for a pool (keyed by its label A, B, …).
  const addPoolCourt = (label: string) =>
    setPoolCourts((prev) => ({ ...prev, [label]: [...(prev[label] ?? []), ''] }));
  const setPoolCourtAt = (label: string, index: number, value: string) =>
    setPoolCourts((prev) => ({
      ...prev,
      [label]: (prev[label] ?? []).map((c, i) => (i === index ? value : c)),
    }));
  const removePoolCourt = (label: string, index: number) =>
    setPoolCourts((prev) => ({
      ...prev,
      [label]: (prev[label] ?? []).filter((_, i) => i !== index),
    }));

  const isPoolPlay = format === 'pool_play_playoff';
  // Pool-bearing formats can opt into "play all N games, both count" (ADR 0040).
  const supportsTotalGames = isPoolPlay || format === 'round_robin';
  const isTotalGames = supportsTotalGames && poolPlayMode === 'total_games';
  const isFixedGames = isPoolPlay && poolSchedule === 'fixed_games';
  const selectedMeta = FORMATS.find((f) => f.value === format)!;
  const belowMin = props.teamCount < selectedMeta.minTeams;
  const teamsPerPool = isPoolPlay ? Math.floor(props.teamCount / poolCount) : 0;
  // Resolve 'all teams advance' to a concrete per-pool count: a single pool
  // advances every team (floored at 2 so the playoff is real); N pools advance
  // each pool's snake-safe floor (floor(teams / pools)).
  const resolvedAdvance =
    advanceSel === 'all'
      ? poolCount === 1
        ? Math.max(2, props.teamCount)
        : Math.max(1, Math.floor(props.teamCount / poolCount))
      : Number(advanceSel) || 1;
  const advancesAll = advanceSel === 'all';
  const estimate = estimateMatches(
    format,
    props.teamCount,
    poolCount,
    resolvedAdvance,
    poolSchedule,
    poolGamesPerTeam,
  );
  // Snake distribution gives the smallest pool floor(teams / pools) teams,
  // so advancing N from each pool requires teams >= pools * advancePerPool.
  // The domain enforces this at generate() time; mirror it here so the host
  // doesn't ship a config that's guaranteed to fail later.
  const poolPlayUnderfilled =
    isPoolPlay && props.teamCount > 0 && resolvedAdvance * poolCount > props.teamCount;

  // Event path opens with a "Teams" step (confirm registered teams + add
  // walk-ins) bound to the event scope; standalone create has no teams yet so
  // it's skipped. `teams` is the live list (refreshes after a walk-in add
  // revalidates the page).
  const teamsScope =
    props.eventId && props.divisionId ? eventScope(props.eventId, props.divisionId) : undefined;
  const showTeamsStep = props.registeredTeams !== undefined && !!teamsScope;
  const teams = props.registeredTeams ?? [];

  // Dynamic step list — the event path leads with "Teams"; pool play earns its
  // own "Pools" step; everything else goes straight from match length to
  // review. `current` is clamped so flipping the format (which can shrink the
  // list) never strands us past the end. Step panels stay mounted and only
  // toggle `hidden`, so their inputs always submit.
  const steps: ReadonlyArray<{ key: string; label: string }> = [
    ...(showTeamsStep ? [{ key: 'teams', label: 'Teams' }] : []),
    { key: 'format', label: 'Format' },
    { key: 'length', label: 'Match length' },
    ...(isPoolPlay ? [{ key: 'pools', label: 'Pools' }] : []),
    { key: 'review', label: 'Review' },
  ];
  const lastStep = steps.length - 1;
  const current = Math.min(step, lastStep);
  const stepKey = steps[current]!.key;
  const onReview = stepKey === 'review';
  const goNext = () => setStep((s) => Math.min(s + 1, lastStep));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));
  const createDisabled = enforceMin && (props.teamCount < 2 || belowMin || poolPlayUnderfilled);

  return (
    <form
      action={props.action ?? createBracketFromForm.bind(null, props.eventId!, props.divisionId!)}
      className="space-y-4"
    >
      {/* Stepper rail — shows the path and lets the host jump back to an
          already-visited step. Forward jumps stay gated behind Next so each
          decision is made in order. */}
      <ol
        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
        aria-label="Bracket setup steps"
      >
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s.key} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => i <= current && setStep(i)}
                disabled={i > current}
                aria-current={active ? 'step' : undefined}
                className={
                  'flex items-center gap-1.5 rounded px-1 py-0.5 ' +
                  (i <= current ? 'cursor-pointer' : 'cursor-default')
                }
              >
                <span
                  className={
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold ' +
                    (active
                      ? 'bg-primary text-white'
                      : done
                        ? 'bg-primary/15 text-primary'
                        : 'border-border-base text-muted border')
                  }
                  aria-hidden="true"
                >
                  {done ? '✓' : i + 1}
                </span>
                <span className={active ? 'text-fg font-medium' : 'text-muted'}>{s.label}</span>
              </button>
              {i < steps.length - 1 && (
                <span className="text-muted/50" aria-hidden="true">
                  →
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {showTeamsStep && (
        <div hidden={stepKey !== 'teams'}>
          <fieldset className="border-border-base bg-bg rounded border p-3">
            <legend className="text-fg/80 px-1 text-xs font-medium">Confirm teams</legend>
            <p className="text-muted text-xs">
              These teams are registered for this division. Add any that signed up off-platform —
              walk-ins, paper sign-ups, off-site entries — so they{'’'}re in the bracket, then
              continue.
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-fg/80 text-sm">
                <span className="text-fg font-semibold">{teams.length}</span> team
                {teams.length === 1 ? '' : 's'} registered
              </span>
              {teamsScope && (
                <FormModal
                  trigger={(open) => (
                    <button type="button" onClick={open} className={neutralButtonClass('sm')}>
                      + Add walk-in / off-site team
                    </button>
                  )}
                  title="Add teams"
                  description="For teams not registered to this division — walk-ins, paper sign-ups, off-platform entries. Add as many as you need; the modal stays open after each. You can edit rosters later from the event's team management page."
                >
                  {(close) => <WalkInTeamForm scope={teamsScope} onClose={close} />}
                </FormModal>
              )}
            </div>
            {teams.length > 0 ? (
              <ol className="divide-border-base border-border-base mt-3 max-h-72 divide-y overflow-y-auto rounded border text-sm">
                {teams.map((t, i) => (
                  <li key={t.entryId} className="flex items-center gap-2 px-3 py-1.5">
                    <span className="text-muted w-5 shrink-0 text-right text-xs tabular-nums">
                      {i + 1}
                    </span>
                    <span className="text-fg truncate">{t.name}</span>
                    {t.captainId === null && (
                      <span className="text-muted shrink-0 text-xs">· walk-in</span>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="border-border-base text-muted mt-3 rounded border border-dashed px-3 py-4 text-center text-xs">
                No teams registered yet. Add walk-in teams above, or wait for registrations.
              </p>
            )}
            {enforceMin && teams.length < 2 && (
              <p className="text-md-warning mt-2 text-xs" role="status">
                You need at least 2 teams to build a bracket.
              </p>
            )}
          </fieldset>
        </div>
      )}

      <div hidden={stepKey !== 'format'}>
        <fieldset className="space-y-2">
          <legend className="text-fg/80 text-sm font-medium">Choose a format</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {FORMATS.map((f) => {
              const selected = format === f.value;
              const disabled = props.teamCount > 0 && props.teamCount < f.minTeams;
              return (
                <label
                  key={f.value}
                  className={
                    'rounded-shape-sm has-focus-visible:ring-primary relative block cursor-pointer border p-3 text-sm transition has-focus-visible:ring-2 ' +
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
                    onChange={() => {
                      setFormat(f.value);
                      // total_games is pool-only; leaving it set on an
                      // elimination format would submit an even bestOf the
                      // domain rejects. Revert to a safe best-of default.
                      if (f.value !== 'pool_play_playoff' && f.value !== 'round_robin') {
                        if (poolPlayMode === 'total_games') chooseBestOf(3);
                      }
                    }}
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
          {enforceMin && props.teamCount >= 2 && belowMin && (
            <p className="text-md-error text-xs" role="alert">
              {selectedMeta.title} needs at least {selectedMeta.minTeams} teams — you have{' '}
              {props.teamCount}. Pick another format or wait for more registrations.
            </p>
          )}
        </fieldset>
      </div>

      <div hidden={stepKey !== 'length'}>
        <fieldset className="border-border-base bg-bg flex flex-wrap items-center gap-3 rounded border p-3">
          <legend className="text-fg/80 px-1 text-xs font-medium">
            {isPoolPlay ? 'Pool play match length' : 'Match length'}
          </legend>
          {/* Scoring-mode toggle — pool-bearing formats can play a fixed number
              of games where both count and a split is a tie (ADR 0040). */}
          {supportsTotalGames && (
            <div role="radiogroup" aria-label="Pool scoring" className="flex basis-full gap-2">
              {(
                [
                  ['best_of', 'Best of N'],
                  ['total_games', 'Play 2 · both count'],
                ] as const
              ).map(([value, label]) => {
                const selected = poolPlayMode === value;
                return (
                  <label
                    key={value}
                    className={
                      'has-focus-visible:ring-primary cursor-pointer rounded border px-3 py-1 text-sm transition has-focus-visible:ring-2 ' +
                      (selected
                        ? 'border-primary bg-primary/10 text-fg'
                        : 'border-border-base bg-bg text-fg/80 hover:border-primary/40')
                    }
                  >
                    <input
                      type="radio"
                      name="pool_scoring"
                      value={value}
                      checked={selected}
                      onChange={() =>
                        value === 'total_games' ? chooseTotalGames(2) : chooseBestOf(3)
                      }
                      className="sr-only"
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          )}
          {!isTotalGames && (
            <div role="radiogroup" aria-label="Best of" className="flex flex-wrap gap-2">
              {([1, 3, 5] as const).map((n) => {
                const selected = bestOf === n;
                return (
                  <label
                    key={n}
                    className={
                      'has-focus-visible:ring-primary cursor-pointer rounded border px-3 py-1 text-sm transition has-focus-visible:ring-2 ' +
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
                      onChange={() => chooseBestOf(n)}
                      className="sr-only"
                    />
                    Best of {n}
                  </label>
                );
              })}
            </div>
          )}
          {/* total_games fixes the count at 2 — submit it as best_of since the
              domain reuses that field for the game count. */}
          {isTotalGames && <input type="hidden" name="best_of" value={bestOf} />}
          <input
            type="hidden"
            name="pool_play_mode"
            value={supportsTotalGames ? poolPlayMode : 'best_of'}
          />
          <div className="basis-full" />
          <PerGameTargets namePrefix="target_score" targets={targetScores} onChange={setTargetAt} />
          <p className="text-muted basis-full text-xs">
            {isTotalGames
              ? `Each match is ${bestOf} games, both counting. A ${bestOf === 2 ? '1-1' : 'split'} is a tie — pools rank by games won, then point differential.`
              : bestOf === 1
                ? 'Single game decides each match — fastest schedule.'
                : `First to ${Math.floor(bestOf / 2) + 1} games wins each match. A best-of-${bestOf} is usually ${formatGameTargets(defaultGameTargets(bestOf))}.`}{' '}
            Point totals are recorded for reference (not enforced).
          </p>
        </fieldset>
      </div>

      {isPoolPlay && (
        <div hidden={stepKey !== 'pools'}>
          <fieldset className="border-border-base bg-bg flex flex-wrap items-end gap-3 rounded border p-3">
            <legend className="text-fg/80 px-1 text-xs font-medium">Pool play options</legend>
            <label className="flex flex-col text-sm">
              <span className="text-fg/80">Pools</span>
              <select
                name="pool_count"
                value={poolCount}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setPoolCount(n);
                  // A single pool feeds the playoff directly, so advancing only
                  // 1 team would leave a 1-team (no) playoff — bump it to 2.
                  if (n === 1 && advanceSel === '1') setAdvanceSel('2');
                }}
                className="border-border-base bg-bg rounded border px-2 py-1"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? '1 (single pool)' : n}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-sm">
              <span className="text-fg/80">
                {poolCount === 1 ? 'Teams in playoff' : 'Advance per pool'}
              </span>
              {/* Unnamed — the resolved numeric count is submitted via the hidden
                  `advance_per_pool` below ('all' isn't a number). */}
              <select
                value={advanceSel}
                onChange={(e) => setAdvanceSel(e.target.value)}
                className="border-border-base bg-bg rounded border px-2 py-1"
              >
                {canAdvanceAll && (
                  <option value="all">
                    {poolCount === 1 ? 'All teams' : 'All teams (full pool)'}
                  </option>
                )}
                {(poolCount === 1 ? [2, 3, 4] : [1, 2, 3, 4]).map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <div className="basis-full" />
            <div
              role="radiogroup"
              aria-label="Pool schedule"
              className="flex flex-col gap-1 text-sm"
            >
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
                        'has-focus-visible:ring-primary cursor-pointer rounded border px-3 py-1 text-sm transition has-focus-visible:ring-2 ' +
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
                  Everyone plays about this many games. In small or uneven pools, opponents repeat
                  so each team still gets a full slate.
                </span>
              </label>
            )}
            <label className="inline-flex basis-full items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="require_work_team"
                checked={requireWorkTeam}
                onChange={(e) => setRequireWorkTeam(e.target.checked)}
                className="border-border-base bg-bg mt-0.5 rounded border"
              />
              <span className="text-fg/80">
                Assign a ref / work team per match
                <span className="text-muted mt-0.5 block text-xs">
                  Auto-fills a free team — the sit-out in odd pools, or (once courts are set) a team
                  not playing that time slot. Even pools playing fully in parallel have no free
                  team, so set those manually with the “Ref / work team” picker on each match.
                </span>
              </span>
            </label>
            {/* Courts — one list per pool. Each court is its own field
                (`pool_courts_<LABEL>`); pools labelled A, B, … to match the
                generator. A pool with courts is split into parallel time-slots so
                no team plays or refs on two courts at once; a pool left empty
                isn't slot-scheduled. */}
            <div className="basis-full space-y-3">
              <span className="text-fg/80 text-sm">
                Courts <span className="text-muted text-xs">(optional)</span>
              </span>
              {Array.from({ length: poolCount }, (_, i) => {
                const label = String.fromCharCode(65 + i);
                const courts = poolCourts[label] ?? [];
                return (
                  <div key={label} className="space-y-1.5">
                    <span className="text-fg/70 text-xs font-medium">
                      {poolCount === 1 ? 'Courts for this pool' : `Pool ${label} courts`}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {courts.map((court, ci) => (
                        <span key={ci} className="inline-flex items-center gap-1">
                          <input
                            type="text"
                            name={`pool_courts_${label}`}
                            value={court}
                            onChange={(e) => setPoolCourtAt(label, ci, e.target.value)}
                            placeholder={`Court ${ci + 1}`}
                            className="border-border-base bg-bg w-28 rounded border px-2 py-1 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => removePoolCourt(label, ci)}
                            aria-label={`Remove court ${ci + 1}`}
                            className="text-muted hover:text-fg tap-target rounded text-sm"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                      <button
                        type="button"
                        onClick={() => addPoolCourt(label)}
                        className={neutralButtonClass('sm')}
                      >
                        + Add court
                      </button>
                    </div>
                  </div>
                );
              })}
              <p className="text-muted text-xs">
                {poolCount === 1
                  ? 'Add the courts this pool plays on to spread matches across them. Leave empty to skip slot scheduling.'
                  : 'Give each pool its own court(s). Pools on different courts play fully in parallel; leave a pool empty to skip its scheduling.'}
              </p>
            </div>
            {/* Playoff-stage match length (ADR 0032) — overrides the pool-play
              best-of / play-to for the single-elim playoff bracket. */}
            <div className="border-border-base/60 basis-full border-t pt-3">
              <p className="text-fg/80 mb-2 text-xs font-medium">Playoff match length</p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col text-sm">
                  <span className="text-fg/80">Best of</span>
                  <select
                    name="playoff_best_of"
                    value={playoffBestOf}
                    onChange={(e) =>
                      choosePlayoffBestOf(
                        e.target.value === '' ? '' : (Number(e.target.value) as 1 | 3 | 5),
                      )
                    }
                    className="border-border-base bg-bg rounded border px-2 py-1"
                  >
                    {/* total_games pools have an even length that can't decide a
                        playoff match, so "same as pool play" isn't offered. */}
                    {!isTotalGames && <option value="">Same as pool play</option>}
                    {[1, 3, 5].map((n) => (
                      <option key={n} value={n}>
                        Best of {n}
                      </option>
                    ))}
                  </select>
                </label>
                {playoffBestOf !== '' && (
                  <PerGameTargets
                    namePrefix="playoff_target_score"
                    targets={playoffTargetScores}
                    onChange={setPlayoffTargetAt}
                  />
                )}
              </div>
              <p className="text-muted mt-1 text-xs">
                {isTotalGames
                  ? 'The playoff must produce a winner, so pick an odd best-of for it (a best-of-3 to 25/25/15 is typical).'
                  : `Leave “Same as pool play” to reuse the pool-play length for the playoff too. A common setup is best-of-1 pool play, best-of-3 playoff to ${formatGameTargets(defaultGameTargets(3))}.`}
              </p>
            </div>
            {/* Resolved 'all'/numeric advance count — the visible select above is
                unnamed so 'all' resolves to a concrete number here. */}
            <input type="hidden" name="advance_per_pool" value={resolvedAdvance} />
            <p className="text-muted basis-full text-xs">
              {poolCount === 1
                ? advancesAll
                  ? `All ${props.teamCount} teams play one pool, then every team advances to a single-elim playoff (pool play seeds the bracket).`
                  : `All ${props.teamCount} teams play one pool; the top ${resolvedAdvance} advance to a single-elim playoff.`
                : advancesAll
                  ? `With ${props.teamCount} teams in ${poolCount} pools (~${teamsPerPool} per pool), every team advances to a single-elim playoff.`
                  : `With ${props.teamCount} teams in ${poolCount} pools, that’s ~${teamsPerPool} per pool. The top ${resolvedAdvance} from each pool advance to a single-elim playoff.`}
            </p>
            {poolPlayUnderfilled && (
              <p className="text-md-error basis-full text-xs" role="alert">
                {poolCount === 1
                  ? `A single-pool playoff of ${resolvedAdvance} needs at least ${resolvedAdvance} teams; you have ${props.teamCount}. Lower the playoff size or wait for more teams to register.`
                  : `${poolCount} pools advancing ${resolvedAdvance} per pool needs at least ${poolCount * resolvedAdvance} teams; you have ${props.teamCount}. Reduce pools or advance-per-pool, or wait for more teams to register.`}
              </p>
            )}
          </fieldset>
        </div>
      )}

      {/* Hidden inputs ensure pool fields are always submitted (server reads them
          unconditionally); when pool-play isn't selected the values are harmless. */}
      {!isPoolPlay && (
        <>
          <input type="hidden" name="pool_count" value={poolCount} />
          <input type="hidden" name="advance_per_pool" value={resolvedAdvance} />
          <input type="hidden" name="pool_schedule" value={poolSchedule} />
          <input type="hidden" name="pool_games_per_team" value={poolGamesPerTeam} />
        </>
      )}

      {/* Review step — a plain-language recap of every choice so the host
          confirms before committing, plus the estimate and any blocking
          warnings. The Create button lives here only. */}
      <div hidden={!onReview}>
        <dl className="border-border-base bg-bg rounded-shape-sm divide-border-base divide-y border text-sm">
          {showTeamsStep && (
            <div className="flex items-baseline justify-between gap-4 px-3 py-2">
              <dt className="text-muted">Teams</dt>
              <dd className="text-fg text-right font-medium">{teams.length} registered</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-4 px-3 py-2">
            <dt className="text-muted">Format</dt>
            <dd className="text-fg text-right font-medium">{selectedMeta.title}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 px-3 py-2">
            <dt className="text-muted">{isPoolPlay ? 'Pool play length' : 'Match length'}</dt>
            <dd className="text-fg text-right font-medium">
              {isTotalGames ? `${bestOf} games · both count` : `Best of ${bestOf}`} ·{' '}
              {formatGameTargets(targetScores)}
            </dd>
          </div>
          {isPoolPlay && (
            <>
              <div className="flex items-baseline justify-between gap-4 px-3 py-2">
                <dt className="text-muted">Pools</dt>
                <dd className="text-fg text-right font-medium">
                  {poolCount === 1 ? '1 pool' : `${poolCount} pools`} ·{' '}
                  {advancesAll
                    ? 'all teams to playoff'
                    : poolCount === 1
                      ? `top ${resolvedAdvance} to playoff`
                      : `top ${resolvedAdvance} per pool advance`}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 px-3 py-2">
                <dt className="text-muted">Playoff length</dt>
                <dd className="text-fg text-right font-medium">
                  {playoffBestOf === ''
                    ? 'Same as pool play'
                    : `Best of ${playoffBestOf} · ${formatGameTargets(playoffTargetScores)}`}
                </dd>
              </div>
            </>
          )}
          {estimate !== null && (
            <div className="flex items-baseline justify-between gap-4 px-3 py-2">
              <dt className="text-muted">Estimated matches</dt>
              <dd className="text-fg text-right font-medium">
                ~{estimate} with {props.teamCount} team{props.teamCount === 1 ? '' : 's'}
              </dd>
            </div>
          )}
        </dl>
        {!enforceMin && (
          <p className="text-muted mt-2 text-xs">
            You{'’'}ll add your teams by name, seed them, then generate the bracket after this.
          </p>
        )}
        {enforceMin && props.teamCount < 2 && (
          <p className="text-md-error mt-2 text-xs" role="alert">
            Need at least 2 registered teams to create a bracket.
          </p>
        )}
        {enforceMin && props.teamCount >= 2 && belowMin && (
          <p className="text-md-error mt-2 text-xs" role="alert">
            {selectedMeta.title} needs at least {selectedMeta.minTeams} teams.
          </p>
        )}
        {poolPlayUnderfilled && (
          <p className="text-md-error mt-2 text-xs" role="alert">
            This pool configuration needs more teams than are registered. Go back and lower the
            pools or advance-per-pool.
          </p>
        )}
      </div>

      {/* Step navigation. Back/Next are `type="button"` so they never submit the
          form; only the review step's Create button is a submit. */}
      <div className="border-border-base bg-bg rounded-shape-sm sticky bottom-2 z-10 flex items-center gap-3 border p-3 shadow-sm">
        <button
          type="button"
          onClick={goBack}
          disabled={current === 0}
          className={neutralButtonClass('md') + ' disabled:invisible'}
        >
          Back
        </button>
        <div className="flex-1" />
        {onReview ? (
          <SubmitButton disabled={createDisabled} className={primaryButtonClass('md')}>
            Create bracket
          </SubmitButton>
        ) : (
          <button type="button" onClick={goNext} className={primaryButtonClass('md')}>
            Next
          </button>
        )}
      </div>
    </form>
  );
}
