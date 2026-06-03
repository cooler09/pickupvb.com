'use client';

import { useState, type FormEvent } from 'react';
import { primaryButtonClass, neutralButtonClass } from '@/components/primary-button';
import {
  fieldInputClass as inputClass,
  fieldLabelClass as labelClass,
} from '@/components/field-styles';
import { useStandingsSync } from '../_lib/use-standings-sync.js';
import {
  addTeams,
  removeTeam,
  recordResult,
  removeResult,
  computeStandings,
  formatStandingsText,
} from '../_lib/standings.js';

export function StandingsBoard({ code }: { code: string }) {
  const { state, setState, status, peerCount } = useStandingsSync(code);
  const [teamDraft, setTeamDraft] = useState('');
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const [copied, setCopied] = useState(false);

  // computeStandings is pure, so deriving the table during render is safe.
  const rows = computeStandings(state);
  const canRecord =
    home !== '' && away !== '' && home !== away && homeScore !== '' && awayScore !== '';

  function onAddTeams(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState(addTeams(state, teamDraft.split(/[\n,]+/)));
    setTeamDraft('');
  }

  function onRecord(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canRecord) return;
    setState(
      recordResult(state, {
        home,
        away,
        homeScore: Number(homeScore) || 0,
        awayScore: Number(awayScore) || 0,
      }),
    );
    setHomeScore('');
    setAwayScore('');
  }

  function copyLink() {
    void navigator.clipboard?.writeText(`${window.location.origin}/tools/standings/${code}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  const dot =
    status === 'connected'
      ? 'bg-emerald-500'
      : status === 'connecting'
        ? 'bg-amber-500'
        : 'bg-red-500';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-muted flex items-center gap-1.5 text-sm">
          <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
          <span className="font-mono font-semibold tracking-widest">{code}</span>
          <span>
            · {peerCount} {peerCount === 1 ? 'device' : 'devices'} · {state.teams.length} team
            {state.teams.length === 1 ? '' : 's'}
          </span>
        </span>
        <button type="button" onClick={copyLink} className={neutralButtonClass('sm')}>
          {copied ? 'Copied!' : 'Share link'}
        </button>
      </div>

      <form onSubmit={onAddTeams} className="flex gap-2">
        <input
          value={teamDraft}
          onChange={(e) => setTeamDraft(e.target.value)}
          placeholder="Add a team — or paste comma-separated"
          aria-label="Add team"
          className={inputClass}
        />
        <button type="submit" className={`${primaryButtonClass('md')} shrink-0`}>
          Add
        </button>
      </form>

      {rows.length > 0 ? (
        <div className="border-border-base rounded-shape-sm overflow-hidden border">
          <table className="w-full text-sm">
            <thead className="bg-fg/5 text-muted text-xs tracking-wide uppercase">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  #
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Team
                </th>
                <th scope="col" className="px-2 py-2 text-right font-medium">
                  W
                </th>
                <th scope="col" className="px-2 py-2 text-right font-medium">
                  L
                </th>
                <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">
                  PF
                </th>
                <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">
                  PA
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Diff
                </th>
                <th scope="col" className="px-2 py-2" aria-label="Remove" />
              </tr>
            </thead>
            <tbody className="divide-border-base divide-y">
              {rows.map((r) => (
                <tr key={r.name}>
                  <td className="text-muted px-3 py-2 tabular-nums">{r.rank}</td>
                  <td className="text-fg px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.wins}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.losses}</td>
                  <td className="text-muted hidden px-2 py-2 text-right tabular-nums sm:table-cell">
                    {r.pointsFor}
                  </td>
                  <td className="text-muted hidden px-2 py-2 text-right tabular-nums sm:table-cell">
                    {r.pointsAgainst}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.diff > 0 ? `+${r.diff}` : r.diff}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setState(removeTeam(state, r.name))}
                      className="text-muted hover:text-fg"
                      aria-label={`Remove ${r.name}`}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-muted text-sm">Add at least two teams to start tracking standings.</p>
      )}

      {state.teams.length >= 2 ? (
        <form
          onSubmit={onRecord}
          className="border-border-base rounded-shape-sm space-y-3 border p-4"
        >
          <span className={labelClass}>Record a result</span>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={home}
              onChange={(e) => setHome(e.target.value)}
              aria-label="Home team"
              className={inputClass}
            >
              <option value="">Team…</option>
              {state.teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={away}
              onChange={(e) => setAway(e.target.value)}
              aria-label="Away team"
              className={inputClass}
            >
              <option value="">Team…</option>
              {state.teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              value={homeScore}
              onChange={(e) => setHomeScore(e.target.value)}
              placeholder="Score"
              aria-label="Home score"
              className={inputClass}
            />
            <input
              type="number"
              min={0}
              value={awayScore}
              onChange={(e) => setAwayScore(e.target.value)}
              placeholder="Score"
              aria-label="Away score"
              className={inputClass}
            />
          </div>
          {home !== '' && home === away ? (
            <p className="text-muted text-xs">Pick two different teams.</p>
          ) : null}
          <button
            type="submit"
            disabled={!canRecord}
            className={`${primaryButtonClass('md')} w-full`}
          >
            Record result
          </button>
        </form>
      ) : null}

      {state.results.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-fg text-sm font-semibold tracking-wide uppercase">
              Results ({state.results.length})
            </h2>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(formatStandingsText(rows));
              }}
              className={neutralButtonClass('sm')}
            >
              Copy table
            </button>
          </div>
          <ol className="divide-border-base border-border-base rounded-shape-sm divide-y border">
            {state.results
              .map((r, i) => ({ r, i }))
              .reverse()
              .map(({ r, i }) => (
                <li key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="text-fg">
                    {r.home} <span className="tabular-nums">{r.homeScore}</span>
                    <span className="text-muted">–</span>
                    <span className="tabular-nums">{r.awayScore}</span> {r.away}
                  </span>
                  <button
                    type="button"
                    onClick={() => setState(removeResult(state, i))}
                    className="text-muted hover:text-fg"
                    aria-label="Undo this result"
                  >
                    ✕
                  </button>
                </li>
              ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
