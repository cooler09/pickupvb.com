'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { DEFAULT_CONFIG } from './_lib/types.js';
import { generateRoomCode } from './_lib/room-code.js';

const labelClass = 'text-fg block text-sm font-medium';
const inputClass =
  'mt-1 block w-full rounded-md border border-border-base bg-bg px-3 py-2 text-sm text-fg shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';

export default function ScoreboardSetupPage() {
  const router = useRouter();
  const [teamA, setTeamA] = useState(DEFAULT_CONFIG.teamA);
  const [teamB, setTeamB] = useState(DEFAULT_CONFIG.teamB);
  const [targetScore, setTargetScore] = useState(DEFAULT_CONFIG.targetScore);
  const [winBy, setWinBy] = useState(DEFAULT_CONFIG.winBy);
  const [bestOf, setBestOf] = useState(DEFAULT_CONFIG.bestOf);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = generateRoomCode();
    const params = new URLSearchParams({
      ta: teamA || DEFAULT_CONFIG.teamA,
      tb: teamB || DEFAULT_CONFIG.teamB,
      t: String(Math.max(1, targetScore)),
      wb: String(Math.max(1, winBy)),
      bo: String(Math.max(1, bestOf)),
    });
    router.push(`/tools/scoreboard/${code}?${params.toString()}` as Route);
  }

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <p className="text-primary text-xs font-semibold tracking-wide uppercase">
          Host tool · Free
        </p>
        <h1 className="text-3xl font-bold">Live score tracker</h1>
        <p className="text-muted text-sm">
          Spin up a full-screen scoreboard with a shareable remote link. Works for any sport — set
          the target score, the win-by margin, and how many sets. Nothing is saved on our servers;
          the game lives on your device and the realtime channel.
        </p>
      </header>

      <form onSubmit={onSubmit} className="border-border-base space-y-5 rounded-lg border p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="teamA" className={labelClass}>
              Team A name
            </label>
            <input
              id="teamA"
              value={teamA}
              onChange={(e) => setTeamA(e.target.value)}
              maxLength={30}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="teamB" className={labelClass}>
              Team B name
            </label>
            <input
              id="teamB"
              value={teamB}
              onChange={(e) => setTeamB(e.target.value)}
              maxLength={30}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="target" className={labelClass}>
              Target score
            </label>
            <input
              id="target"
              type="number"
              min={1}
              max={99}
              value={targetScore}
              onChange={(e) => setTargetScore(Number(e.target.value) || 1)}
              className={inputClass}
            />
            <p className="text-muted mt-1 text-xs">25 volleyball · 11 pickleball</p>
          </div>
          <div>
            <label htmlFor="winby" className={labelClass}>
              Win by
            </label>
            <input
              id="winby"
              type="number"
              min={1}
              max={10}
              value={winBy}
              onChange={(e) => setWinBy(Number(e.target.value) || 1)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="bestof" className={labelClass}>
              Best of sets
            </label>
            <input
              id="bestof"
              type="number"
              min={1}
              max={9}
              step={2}
              value={bestOf}
              onChange={(e) => setBestOf(Number(e.target.value) || 1)}
              className={inputClass}
            />
            <p className="text-muted mt-1 text-xs">1 = single game</p>
          </div>
        </div>

        <div className="border-border-base border-t pt-4">
          <button
            type="submit"
            className="bg-primary hover:bg-primary/90 focus-visible:ring-primary w-full rounded-md px-4 py-2.5 font-semibold text-white shadow-sm focus:outline-none focus-visible:ring-2"
          >
            Start scoreboard
          </button>
          <p className="text-muted mt-2 text-center text-xs">
            You can adjust the target/win-by mid-match — the host always has the final say.
          </p>
        </div>
      </form>

      <div className="text-muted border-border-base rounded-md border border-dashed p-4 text-xs">
        <p className="text-fg font-medium">How it works</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Your device shows a full-screen scoreboard.</li>
          <li>Share the room URL with anyone — they get a phone-sized remote.</li>
          <li>Taps on either device update both in real time.</li>
          <li>State auto-clears after 24h of inactivity.</li>
        </ul>
      </div>
    </section>
  );
}
