'use client';

import { useCallback, useEffect, useState } from 'react';
import { useScoreboardSync } from '../../../_lib/use-scoreboard-sync.js';
import {
  commitSet,
  increment,
  isSetWon,
  matchWinner,
  type ScoreboardConfig,
  type TeamId,
} from '../../../_lib/types.js';

type Props = {
  code: string;
  initialConfig: ScoreboardConfig;
};

type LocalTheme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'pickupvb:scoreboard:theme';

export function RemoteControl({ code, initialConfig }: Props) {
  const { state, setState, status, peerCount } = useScoreboardSync(code, initialConfig);
  const [theme, setTheme] = useState<LocalTheme>('dark');

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') setTheme(stored);
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const winner = matchWinner(state);

  const onPoint = useCallback(
    (team: TeamId, delta: 1 | -1) => {
      if (winner) return;
      setState(increment(state, team, delta));
    },
    [state, setState, winner],
  );
  const onCommitSet = useCallback(
    (team: TeamId) => {
      setState(commitSet(state, team));
    },
    [state, setState],
  );

  const bg = theme === 'dark' ? 'bg-black text-white' : 'bg-white text-black';
  const border = theme === 'dark' ? 'border-white/15' : 'border-black/15';
  const subtle = theme === 'dark' ? 'text-white/60' : 'text-black/60';
  const dot =
    status === 'connected'
      ? 'bg-emerald-500'
      : status === 'connecting'
        ? 'bg-amber-500'
        : 'bg-red-500';

  return (
    <div className={`fixed inset-0 z-50 flex flex-col ${bg}`}>
      <header className={`flex items-center justify-between border-b ${border} px-4 py-2 text-sm`}>
        <div className="flex items-center gap-2">
          <span className="font-mono text-base font-semibold tracking-widest">{code}</span>
          <span className={`flex items-center gap-1.5 ${subtle}`}>
            <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
            {peerCount} {peerCount === 1 ? 'device' : 'devices'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          className={`rounded-md border ${border} px-3 py-1.5`}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </header>

      <div className="flex flex-1 flex-col">
        <TeamRemote
          name={state.config.teamA}
          score={state.scoreA}
          sets={state.setsA}
          setPoint={isSetWon(state, 'A') && !winner}
          border={border}
          subtle={subtle}
          onPlus={() => onPoint('A', 1)}
          onMinus={() => onPoint('A', -1)}
          onWinSet={() => onCommitSet('A')}
        />
        <div className={`h-px ${border} border-b`} aria-hidden />
        <TeamRemote
          name={state.config.teamB}
          score={state.scoreB}
          sets={state.setsB}
          setPoint={isSetWon(state, 'B') && !winner}
          border={border}
          subtle={subtle}
          onPlus={() => onPoint('B', 1)}
          onMinus={() => onPoint('B', -1)}
          onWinSet={() => onCommitSet('B')}
        />
      </div>

      <footer className={`border-t ${border} px-4 py-2 text-center text-xs ${subtle}`}>
        Remote control · changes sync to the scoreboard in real time
      </footer>

      {winner && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
          <div className="rounded-shape-md bg-white p-6 text-center text-black shadow-xl">
            <p className="text-md-success text-xs font-semibold tracking-widest uppercase">
              Match won
            </p>
            <p className="text-headline-lg mt-2 font-bold">
              {winner === 'A' ? state.config.teamA : state.config.teamB}
            </p>
            <p className="mt-2 text-sm text-black/60">
              Reset from the scoreboard device to play again.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function TeamRemote({
  name,
  score,
  sets,
  setPoint,
  border,
  subtle,
  onPlus,
  onMinus,
  onWinSet,
}: {
  name: string;
  score: number;
  sets: number;
  setPoint: boolean;
  border: string;
  subtle: string;
  onPlus: () => void;
  onMinus: () => void;
  onWinSet: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between px-5 pt-4">
        <div>
          <div className={`text-sm tracking-widest uppercase ${subtle}`}>{name}</div>
          <div className={`text-xs ${subtle}`}>
            Sets <span className="font-semibold tabular-nums">{sets}</span>
          </div>
        </div>
        <div className="text-display-lg font-bold tabular-nums">{score}</div>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-3 p-4">
        <button
          type="button"
          onClick={onMinus}
          className={`rounded-shape-md flex items-center justify-center border ${border} text-headline-lg font-bold`}
          aria-label={`Subtract point from ${name}`}
        >
          −
        </button>
        <button
          type="button"
          onClick={onPlus}
          className="rounded-shape-md text-headline-lg flex items-center justify-center bg-emerald-500 font-bold text-white"
          aria-label={`Add point to ${name}`}
        >
          +
        </button>
      </div>
      {setPoint && (
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={onWinSet}
            className="rounded-shape-md w-full bg-amber-500 py-3 text-sm font-bold tracking-widest text-black uppercase"
          >
            Set point — Win set
          </button>
        </div>
      )}
    </div>
  );
}
