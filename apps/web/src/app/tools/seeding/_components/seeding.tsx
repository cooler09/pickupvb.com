'use client';

import { useState } from 'react';
import {
  primaryButtonClass,
  neutralButtonClass,
  tonalButtonClass,
} from '@/components/primary-button';
import {
  fieldInputClass as inputClass,
  fieldLabelClass as labelClass,
  fieldHintClass as hintClass,
} from '@/components/field-styles';
import {
  parseRoster,
  hasRatings,
  seedOrder,
  intoPools,
  formatSeedsText,
  poolLabel,
  type SeedMode,
  type Seed,
} from '../_lib/seeding.js';

const MODES: { value: SeedMode; label: string }[] = [
  { value: 'ranked', label: 'Ranked' },
  { value: 'random', label: 'Random' },
];

export function SeedingTool() {
  const [roster, setRoster] = useState('');
  const [mode, setMode] = useState<SeedMode>('ranked');
  const [pools, setPools] = useState(1);
  const [seeds, setSeeds] = useState<Seed[] | null>(null);
  const [copied, setCopied] = useState(false);

  // `parseRoster` is pure, so deriving the roster during render is safe — only
  // the draw (in `generate()`) touches `Math.random`. Pool distribution is
  // deterministic, so it re-derives live from the stored draw as `pools` change.
  const players = parseRoster(roster);
  const rated = hasRatings(players);
  const canMake = players.length >= 2;
  const poolCount = Math.max(1, pools);
  const distributed = seeds ? intoPools(seeds, poolCount) : [];
  const multi = poolCount > 1;

  function generate() {
    if (!canMake) return;
    setSeeds(seedOrder(players, mode));
    setCopied(false);
  }

  function copy() {
    if (distributed.length === 0) return;
    void navigator.clipboard?.writeText(formatSeedsText(distributed));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-6">
      <div className="border-border-base rounded-shape-sm space-y-5 border p-5">
        <div>
          <label htmlFor="roster" className={labelClass}>
            Teams or players
          </label>
          <textarea
            id="roster"
            value={roster}
            onChange={(e) => {
              setRoster(e.target.value);
              setSeeds(null);
            }}
            rows={8}
            placeholder={'Sharks 9\nJets 7\nRaptors 5\nKings 3…'}
            className={`${inputClass} resize-y font-mono`}
          />
          <p className={hintClass}>
            One per line. Add a skill rating after a name to rank by strength — e.g.{' '}
            <span className="font-mono">Sharks 9</span>.{' '}
            {players.length > 0
              ? `${players.length} entr${players.length === 1 ? 'y' : 'ies'}.`
              : ''}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className={labelClass}>Seed by</span>
            <div className="mt-1 flex gap-2" role="group" aria-label="Seed mode">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  aria-pressed={mode === m.value}
                  onClick={() => {
                    setMode(m.value);
                    setSeeds(null);
                  }}
                  className={mode === m.value ? tonalButtonClass('md') : neutralButtonClass('md')}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="pools" className={labelClass}>
              Pools
            </label>
            <input
              id="pools"
              type="number"
              min={1}
              max={26}
              value={pools}
              onChange={(e) => setPools(Number(e.target.value) || 1)}
              className={inputClass}
            />
            <p className={hintClass}>Snake the seeds into this many pools (1 = one ranked list).</p>
          </div>
        </div>

        {mode === 'ranked' && players.length > 0 && !rated ? (
          <p className={hintClass}>
            No ratings detected — seeding by entry order. Add a number after a name to rank by
            skill.
          </p>
        ) : null}

        <div className="border-border-base border-t pt-4">
          <button
            type="button"
            onClick={generate}
            disabled={!canMake}
            className={`${primaryButtonClass('md')} w-full`}
          >
            {seeds ? 'Regenerate' : 'Generate seeds'}
          </button>
          {!canMake ? (
            <p className="text-muted mt-2 text-center text-xs">Add at least 2 entries.</p>
          ) : null}
        </div>
      </div>

      {distributed.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-fg text-lg font-semibold">
              {multi ? `${poolCount} pools` : 'Seed order'}
            </h2>
            <button type="button" onClick={copy} className={neutralButtonClass('sm')}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <ul className={multi ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-1'}>
            {multi
              ? distributed.map((pool, p) => (
                  <li
                    key={p}
                    className="border-border-base rounded-shape-sm flex flex-col border p-4"
                  >
                    <h3 className="text-fg mb-2 font-semibold">Pool {poolLabel(p)}</h3>
                    <ul className="space-y-1 text-sm">
                      {pool.map((s) => (
                        <SeedRow key={s.seed} seed={s} />
                      ))}
                    </ul>
                  </li>
                ))
              : distributed[0]?.map((s) => (
                  <li
                    key={s.seed}
                    className="border-border-base rounded-shape-sm flex items-center justify-between gap-2 border px-3 py-2 text-sm"
                  >
                    <span className="text-fg">
                      <span className="text-muted">{s.seed}.</span> {s.name}
                    </span>
                    {s.rating !== undefined ? <RatingBadge value={s.rating} /> : null}
                  </li>
                ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function SeedRow({ seed }: { seed: Seed }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="text-fg">
        <span className="text-muted">{seed.seed}.</span> {seed.name}
      </span>
      {seed.rating !== undefined ? <RatingBadge value={seed.rating} /> : null}
    </li>
  );
}

function RatingBadge({ value }: { value: number }) {
  return <span className="bg-fg/5 text-muted shrink-0 rounded px-1.5 py-0.5 text-xs">{value}</span>;
}
