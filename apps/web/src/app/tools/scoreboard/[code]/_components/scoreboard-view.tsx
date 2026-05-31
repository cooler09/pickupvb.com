'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { useScoreboardSync } from '../../_lib/use-scoreboard-sync.js';
import { clearState } from '../../_lib/storage.js';
import {
  commitSet,
  increment,
  isSetWon,
  matchWinner,
  resetMatch,
  setsToWin,
  swapSides,
  type ScoreboardConfig,
  type ScoreboardState,
  type TeamId,
} from '../../_lib/types.js';
import type { MatchBinding } from '../../_lib/binding.js';
import {
  finalizeMatchFromScoreboard,
  pushLiveScore,
  type FinalizeReason,
} from '../finalize-actions.js';

type Props = {
  code: string;
  initialConfig: ScoreboardConfig;
  /** Present when launched from a scheduled match — enables "Save final to match". */
  binding?: MatchBinding;
};

type LocalTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'pickupvb:scoreboard:theme';

export function ScoreboardView({ code, initialConfig, binding }: Props) {
  const { state, setState, status, peerCount } = useScoreboardSync(code, initialConfig);
  const [theme, setTheme] = useState<LocalTheme>('dark');
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  // Local theme override persists across reloads but doesn't touch
  // the global site theme cookie — the scoreboard is its own surface.
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

  useEffect(() => {
    // Short alias ("pickupvb.com/s/ABCD") that redirects to the canonical
    // /tools/scoreboard/{code}/remote URL. Keeps the share link readable
    // aloud at a gym and easy to type on a phone. The remote inherits
    // team names + target / win-by / best-of from the first realtime
    // broadcast off this scoreboard, so no query string is needed.
    setShareUrl(`${window.location.origin}/s/${code}`);
  }, [code]);

  // Keep the screen awake on the scoreboard tab while in use.
  useEffect(() => {
    type WakeLockSentinel = { release: () => Promise<void> };
    type WakeLockNavigator = {
      wakeLock?: { request: (kind: 'screen') => Promise<WakeLockSentinel> };
    };
    const nav = navigator as unknown as WakeLockNavigator;
    if (!nav.wakeLock) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    nav.wakeLock
      .request('screen')
      .then((s) => {
        if (cancelled) {
          void s.release();
        } else {
          sentinel = s;
        }
      })
      .catch(() => {
        // wake lock denied — silently continue
      });
    return () => {
      cancelled = true;
      if (sentinel) void sentinel.release();
    };
  }, []);

  // When bound to a scheduled match, mirror the live score to the public
  // bracket/standings (ADR 0023). Debounced: each change resets the timer, so
  // we persist ~0.8s after the last tap rather than on every point.
  useEffect(() => {
    if (!binding) return;
    const timer = setTimeout(() => {
      void pushLiveScore(binding, state);
    }, 800);
    return () => clearTimeout(timer);
  }, [binding, state]);

  const winner = matchWinner(state);
  const setPointA = isSetWon(state, 'A');
  const setPointB = isSetWon(state, 'B');

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

  const onResetMatch = useCallback(() => {
    setState(resetMatch(state.config, state.version));
  }, [state.config, state.version, setState]);

  const onSwap = useCallback(() => {
    setState(swapSides(state));
  }, [state, setState]);

  const onNewGame = useCallback(() => {
    clearState(code);
    window.location.href = '/tools/scoreboard';
  }, [code]);

  const onCopyUrl = useCallback(() => {
    void navigator.clipboard.writeText(shareUrl);
  }, [shareUrl]);

  const onShare = useCallback(() => {
    type ShareNavigator = { share?: (data: ShareData) => Promise<void> };
    const nav = navigator as unknown as ShareNavigator;
    if (nav.share) {
      void nav.share({
        title: 'Scoreboard remote',
        text: `Control the scoreboard for ${state.config.teamA} vs ${state.config.teamB}`,
        url: shareUrl,
      });
    } else {
      onCopyUrl();
    }
  }, [shareUrl, state.config.teamA, state.config.teamB, onCopyUrl]);

  const bg = theme === 'dark' ? 'bg-black text-white' : 'bg-white text-black';
  const surface = theme === 'dark' ? 'bg-white/5' : 'bg-black/5';
  const subtle = theme === 'dark' ? 'text-white/60' : 'text-black/60';
  const border = theme === 'dark' ? 'border-white/15' : 'border-black/15';

  return (
    <div className={`fixed inset-0 z-50 ${bg} flex flex-col`}>
      <TopBar
        code={code}
        status={status}
        peerCount={peerCount}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        onShare={() => setShareOpen(true)}
        onNewGame={onNewGame}
        subtle={subtle}
        border={border}
      />

      <div className="flex flex-1 items-stretch">
        <TeamPanel
          name={state.config.teamA}
          score={state.scoreA}
          sets={state.setsA}
          setPoint={setPointA}
          winnerSide={winner === 'A'}
          surface={surface}
          subtle={subtle}
          border={border}
          onPlus={() => onPoint('A', 1)}
          onMinus={() => onPoint('A', -1)}
          {...(setPointA && !winner ? { onWinSet: () => onCommitSet('A') } : {})}
        />
        <div className={`w-px ${border} border-r`} aria-hidden />
        <TeamPanel
          name={state.config.teamB}
          score={state.scoreB}
          sets={state.setsB}
          setPoint={setPointB}
          winnerSide={winner === 'B'}
          surface={surface}
          subtle={subtle}
          border={border}
          onPlus={() => onPoint('B', 1)}
          onMinus={() => onPoint('B', -1)}
          {...(setPointB && !winner ? { onWinSet: () => onCommitSet('B') } : {})}
        />
      </div>

      {binding && (
        <SaveToMatchBar binding={binding} state={state} border={border} subtle={subtle} />
      )}

      <BottomBar
        state={state}
        subtle={subtle}
        border={border}
        onSwap={onSwap}
        onResetMatch={onResetMatch}
      />

      {winner && (
        <WinnerOverlay
          name={winner === 'A' ? state.config.teamA : state.config.teamB}
          onNewGame={onNewGame}
          onResetMatch={onResetMatch}
        />
      )}

      {shareOpen && (
        <ShareModal
          url={shareUrl}
          onClose={() => setShareOpen(false)}
          onCopy={onCopyUrl}
          onShare={onShare}
          theme={theme}
        />
      )}
    </div>
  );
}

function TopBar({
  code,
  status,
  peerCount,
  theme,
  onToggleTheme,
  onShare,
  onNewGame,
  subtle,
  border,
}: {
  code: string;
  status: string;
  peerCount: number;
  theme: LocalTheme;
  onToggleTheme: () => void;
  onShare: () => void;
  onNewGame: () => void;
  subtle: string;
  border: string;
}) {
  const dot =
    status === 'connected'
      ? 'bg-emerald-500'
      : status === 'connecting'
        ? 'bg-amber-500'
        : 'bg-red-500';
  return (
    <header
      className={`flex items-center justify-between gap-3 border-b ${border} px-4 py-2 text-sm`}
    >
      <div className="flex items-center gap-3">
        <Link href={'/tools' as Route} className={`${subtle} hover:underline`}>
          ← Tools
        </Link>
        <span className={`hidden sm:inline ${subtle}`}>·</span>
        <span className="font-mono text-base font-semibold tracking-widest">{code}</span>
        <span className={`flex items-center gap-1.5 ${subtle}`}>
          <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
          <span className="hidden sm:inline">
            {status} · {peerCount} {peerCount === 1 ? 'device' : 'devices'}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onShare}
          className={`rounded-md border ${border} px-3 py-1.5 hover:bg-current/10`}
        >
          Remote link
        </button>
        <button
          type="button"
          onClick={onToggleTheme}
          className={`rounded-md border ${border} px-3 py-1.5`}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
        <button
          type="button"
          onClick={onNewGame}
          className={`rounded-md border ${border} px-3 py-1.5`}
        >
          New game
        </button>
      </div>
    </header>
  );
}

function TeamPanel({
  name,
  score,
  sets,
  setPoint,
  winnerSide,
  surface,
  subtle,
  border,
  onPlus,
  onMinus,
  onWinSet,
}: {
  name: string;
  score: number;
  sets: number;
  setPoint: boolean;
  winnerSide: boolean;
  surface: string;
  subtle: string;
  border: string;
  onPlus: () => void;
  onMinus: () => void;
  onWinSet?: () => void;
}) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center">
      <button
        type="button"
        onClick={onPlus}
        className="group absolute inset-0 flex flex-col items-center justify-center focus:outline-none"
        aria-label={`Add point to ${name}`}
      >
        <div className={`text-xl font-semibold tracking-wide sm:text-3xl ${subtle}`}>{name}</div>
        <div
          className="text-[28vh] leading-none font-bold tabular-nums select-none sm:text-[34vh]"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {score}
        </div>
        <div className={`mt-2 text-base ${subtle}`}>
          Sets: <span className="text-fg font-semibold tabular-nums">{sets}</span>
        </div>
        {setPoint && !winnerSide && (
          <div className="mt-3 rounded-full bg-amber-500/90 px-3 py-1 text-xs font-bold tracking-widest text-black uppercase">
            Set point
          </div>
        )}
      </button>

      {/* Controls layered above the giant tap-target. Pointer-events-auto re-enables clicks. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMinus();
          }}
          className={`pointer-events-auto rounded-md border ${border} ${surface} px-4 py-2 text-sm font-medium`}
        >
          − 1
        </button>
        {onWinSet && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onWinSet();
            }}
            className="pointer-events-auto rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
          >
            Win set
          </button>
        )}
      </div>
    </div>
  );
}

const REASON_TEXT: Record<FinalizeReason, string> = {
  pro_required: "Live scoring is a Pro feature for this event's host.",
  forbidden: "You're not allowed to record this match.",
  conflict: 'This match was already updated elsewhere.',
  notfound: 'This match could not be found.',
  invalid: "The score isn't ready to save yet.",
  error: 'Something went wrong saving the result.',
};

function SaveToMatchBar({
  binding,
  state,
  border,
  subtle,
}: {
  binding: MatchBinding;
  state: ScoreboardState;
  border: string;
  subtle: string;
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const winner = matchWinner(state);

  const onSave = useCallback(() => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await finalizeMatchFromScoreboard(binding, state);
      if (result.ok) {
        setSaved(true);
      } else {
        const base = REASON_TEXT[result.reason];
        setError(result.message ? `${base} (${result.message})` : base);
      }
    });
  }, [binding, state]);

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-t ${border} px-4 py-2 text-sm`}
    >
      <div className={`flex items-center gap-2 ${subtle}`}>
        <span
          className={`rounded border ${border} px-2 py-0.5 text-xs font-semibold tracking-wide uppercase`}
        >
          Match
        </span>
        <span>
          {winner
            ? 'Match complete — save the result to the schedule.'
            : 'Scoring a scheduled match. Save when the match is final.'}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {saved ? (
          <>
            <span className="text-sm font-medium text-emerald-500">Saved ✓</span>
            <Link href={binding.returnPath as Route} className={`text-sm underline ${subtle}`}>
              Back to event
            </Link>
          </>
        ) : (
          <>
            {error && <span className="max-w-xs text-xs text-red-400">{error}</span>}
            <button
              type="button"
              onClick={onSave}
              disabled={pending}
              className="rounded-md bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save final to match'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function BottomBar({
  state,
  subtle,
  border,
  onSwap,
  onResetMatch,
}: {
  state: ScoreboardState;
  subtle: string;
  border: string;
  onSwap: () => void;
  onResetMatch: () => void;
}) {
  const need = setsToWin(state.config.bestOf);
  const historyLabel = useMemo(
    () =>
      state.setHistory.length > 0 ? state.setHistory.map((h) => `${h.a}-${h.b}`).join(' · ') : '—',
    [state.setHistory],
  );
  return (
    <footer
      className={`flex flex-wrap items-center justify-between gap-3 border-t ${border} px-4 py-2 text-xs ${subtle}`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          First to {state.config.targetScore} (win by {state.config.winBy})
        </span>
        <span>
          Best of {state.config.bestOf} · first to {need} sets
        </span>
        <span>Past sets: {historyLabel}</span>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onSwap} className={`rounded-md border ${border} px-3 py-1`}>
          Swap sides
        </button>
        <button
          type="button"
          onClick={onResetMatch}
          className={`rounded-md border ${border} px-3 py-1`}
        >
          Reset match
        </button>
      </div>
    </footer>
  );
}

function WinnerOverlay({
  name,
  onNewGame,
  onResetMatch,
}: {
  name: string;
  onNewGame: () => void;
  onResetMatch: () => void;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="rounded-shape-md bg-white p-8 text-center text-black shadow-xl">
        <p className="text-xs font-semibold tracking-widest text-emerald-600 uppercase">
          Match won
        </p>
        <p className="mt-2 text-4xl font-bold">{name}</p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={onResetMatch}
            className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium"
          >
            Rematch
          </button>
          <button
            type="button"
            onClick={onNewGame}
            className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white"
          >
            New game
          </button>
        </div>
      </div>
    </div>
  );
}

function ShareModal({
  url,
  onClose,
  onCopy,
  onShare,
  theme,
}: {
  url: string;
  onClose: () => void;
  onCopy: () => void;
  onShare: () => void;
  theme: LocalTheme;
}) {
  const surface = theme === 'dark' ? 'bg-zinc-900 text-white' : 'bg-white text-black';
  return (
    <div
      className="absolute inset-0 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className={`rounded-shape-md w-full max-w-lg ${surface} p-6 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Remote control link</h2>
        <p className="mt-1 text-sm opacity-70">
          Open this URL on any phone — taps there update this scoreboard live.
        </p>
        <div className="mt-4 rounded-md border border-current/15 bg-current/5 p-3 font-mono text-sm break-all">
          {url}
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCopy}
            className="rounded-md border border-current/20 px-4 py-2 text-sm font-medium"
          >
            Copy link
          </button>
          <button
            type="button"
            onClick={onShare}
            className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white"
          >
            Share
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium opacity-70"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
