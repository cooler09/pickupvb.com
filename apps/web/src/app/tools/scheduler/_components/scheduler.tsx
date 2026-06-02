'use client';

import { useState } from 'react';
import { neutralButtonClass } from '@/components/primary-button';
import {
  fieldInputClass as inputClass,
  fieldLabelClass as labelClass,
  fieldHintClass as hintClass,
} from '@/components/field-styles';
import { EventBindingBanner } from '../../_components/event-binding-banner';
import type { EventBindingView } from '../../_lib/event-binding';
import { parseTeams, roundRobin, gameCount, formatScheduleText } from '../_lib/schedule.js';

export function Scheduler({
  initialTeams = [],
  eventBinding,
}: {
  initialTeams?: ReadonlyArray<string>;
  eventBinding?: EventBindingView;
} = {}) {
  const [teamsRaw, setTeamsRaw] = useState(initialTeams.join('\n'));
  const [courts, setCourts] = useState(1);
  const [copied, setCopied] = useState(false);

  // Everything here is pure (no randomness), so the schedule can be derived
  // live during render — no "Generate" button, results update as you type.
  const teams = parseTeams(teamsRaw);
  const courtCount = Math.max(1, courts);
  const rounds = teams.length >= 2 ? roundRobin(teams, courtCount) : [];
  const games = gameCount(rounds);

  function copy() {
    if (rounds.length === 0) return;
    void navigator.clipboard?.writeText(formatScheduleText(rounds));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-6">
      {eventBinding ? (
        <EventBindingBanner
          eventTitle={eventBinding.eventTitle}
          divisionLabel={eventBinding.divisionLabel}
          ret={eventBinding.ret}
        />
      ) : null}

      {eventBinding ? (
        <p className="text-muted text-xs">
          Preview a round-robin from your registered teams. To run it for real, set up{' '}
          <span className="font-medium">pool play</span> on the bracket — the bracket generates and
          tracks the official matchups.
        </p>
      ) : null}

      <div className="border-border-base rounded-shape-sm space-y-5 border p-5">
        <div>
          <label htmlFor="teams" className={labelClass}>
            Teams
          </label>
          <textarea
            id="teams"
            value={teamsRaw}
            onChange={(e) => setTeamsRaw(e.target.value)}
            rows={8}
            placeholder={'Sharks\nJets\nRaptors\nKings…'}
            className={`${inputClass} resize-y font-mono`}
          />
          <p className={hintClass}>
            One team per line. Every team plays every other team once.{' '}
            {teams.length > 0 ? `${teams.length} team${teams.length === 1 ? '' : 's'}.` : ''}
          </p>
        </div>

        <div className="sm:w-1/2">
          <label htmlFor="courts" className={labelClass}>
            Courts
          </label>
          <input
            id="courts"
            type="number"
            min={1}
            max={20}
            value={courts}
            onChange={(e) => setCourts(Number(e.target.value) || 1)}
            className={inputClass}
          />
          <p className={hintClass}>Games in each round are spread across this many courts.</p>
        </div>
      </div>

      {rounds.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-fg text-lg font-semibold">
              {rounds.length} round{rounds.length === 1 ? '' : 's'} · {games} game
              {games === 1 ? '' : 's'}
            </h2>
            <button type="button" onClick={copy} className={neutralButtonClass('sm')}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rounds.map((round, i) => (
              <li key={i} className="border-border-base rounded-shape-sm flex flex-col border p-4">
                <h3 className="text-fg mb-2 font-semibold">Round {i + 1}</h3>
                <ul className="space-y-1 text-sm">
                  {round.matches.map((m, j) => (
                    <li key={j} className="flex items-center justify-between gap-2">
                      <span className="text-fg">
                        {m.home} <span className="text-muted">vs</span> {m.away}
                      </span>
                      {m.court !== undefined ? (
                        <span className="bg-fg/5 text-muted shrink-0 rounded px-1.5 py-0.5 text-xs">
                          Court {m.court}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      ) : teams.length === 1 ? (
        <p className="text-muted text-sm">Add at least 2 teams to generate a schedule.</p>
      ) : null}
    </div>
  );
}
