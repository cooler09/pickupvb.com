'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { useTimerSync } from '../_lib/use-timer-sync.js';
import {
  start,
  pause,
  reset,
  adjust,
  remainingMs,
  isExpired,
  formatClock,
  type TimerConfig,
} from '../_lib/timer.js';

const MINUTE = 60_000;

export function TimerView({ code, initialConfig }: { code: string; initialConfig: TimerConfig }) {
  const { state, setState, status, peerCount } = useTimerSync(code, initialConfig);
  // `now` drives the local countdown. It's only updated from timer callbacks
  // (never synchronously in the effect body, never in render), so `Date.now()`
  // stays out of the render path. Ticks only while the clock is running.
  const [now, setNow] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!state.running) return;
    const tick = () => setNow(Date.now());
    const immediate = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 250);
    return () => {
      window.clearTimeout(immediate);
      window.clearInterval(id);
    };
  }, [state.running]);

  // Keep the screen awake while the timer is on display.
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
        if (cancelled) void s.release();
        else sentinel = s;
      })
      .catch(() => {
        // wake lock denied — silently continue
      });
    return () => {
      cancelled = true;
      if (sentinel) void sentinel.release();
    };
  }, []);

  const ms = now > 0 ? remainingMs(state, now) : Math.max(0, state.remainingMs);
  const expired = now > 0 && isExpired(state, now);
  const canStart = !state.running && ms > 0;

  function copyLink() {
    void navigator.clipboard?.writeText(`${window.location.origin}/tools/timer/${code}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  const dot =
    status === 'connected'
      ? 'bg-emerald-500'
      : status === 'connecting'
        ? 'bg-amber-500'
        : 'bg-red-500';
  const ctrl =
    'rounded-md border border-white/20 px-4 py-2 text-sm font-medium hover:bg-white/10 disabled:opacity-40';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <header className="flex items-center justify-between gap-3 border-b border-white/15 px-4 py-2 text-sm">
        <div className="flex items-center gap-3">
          <Link href={'/tools' as Route} className="text-white/60 hover:underline">
            ← Tools
          </Link>
          <span className="font-mono text-base font-semibold tracking-widest">{code}</span>
          <span className="flex items-center gap-1.5 text-white/60">
            <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
            <span className="hidden sm:inline">
              {peerCount} {peerCount === 1 ? 'device' : 'devices'}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={copyLink} className={ctrl}>
            {copied ? 'Copied!' : 'Share link'}
          </button>
          <Link href={'/tools/timer' as Route} className={ctrl}>
            New timer
          </Link>
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-4">
        {state.label ? (
          <div className="text-headline-sm sm:text-display-sm mb-2 font-semibold tracking-wide text-white/60">
            {state.label}
          </div>
        ) : null}
        <div
          className={`text-[22vw] leading-none font-bold tabular-nums select-none sm:text-[26vh] ${
            expired ? 'animate-pulse text-red-500' : ''
          }`}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {formatClock(ms)}
        </div>
        {expired ? (
          <div className="mt-4 rounded-full bg-red-500 px-4 py-1.5 text-sm font-bold tracking-widest uppercase">
            Time
          </div>
        ) : null}
      </div>

      <footer className="flex flex-col items-center gap-3 border-t border-white/15 px-4 py-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setState(adjust(state, -MINUTE))} className={ctrl}>
            −1:00
          </button>
          {state.running ? (
            <button
              type="button"
              onClick={() => setState(pause(state))}
              className="rounded-md bg-white px-8 py-2.5 text-base font-semibold text-black hover:bg-white/90"
            >
              Pause
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setState(start(state))}
              disabled={!canStart}
              className="rounded-md bg-emerald-500 px-8 py-2.5 text-base font-semibold text-white hover:bg-emerald-600 disabled:opacity-40"
            >
              {ms === state.durationMs ? 'Start' : 'Resume'}
            </button>
          )}
          <button type="button" onClick={() => setState(adjust(state, MINUTE))} className={ctrl}>
            +1:00
          </button>
        </div>
        <button
          type="button"
          onClick={() => setState(reset(state))}
          className="text-sm text-white/60 hover:text-white hover:underline"
        >
          Reset to {formatClock(state.durationMs)}
        </button>
      </footer>
    </div>
  );
}
