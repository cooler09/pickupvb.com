'use client';

import { useState, useTransition } from 'react';
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
import { EventBindingBanner } from '../../_components/event-binding-banner';
import type { EventBindingView } from '../../_lib/event-binding';
import { saveRandomTeamsToEvent, type SaveTeamsResult } from '../event-actions';
import {
  parseRoster,
  hasRatings,
  splitTeams,
  teamSummary,
  formatTeamsText,
  type SplitMode,
  type Team,
} from '../_lib/split.js';

const MODES: { value: SplitMode; label: string }[] = [
  { value: 'random', label: 'Random' },
  { value: 'balanced', label: 'Balanced' },
];

function saveError(res: Extract<SaveTeamsResult, { ok: false }>): string {
  switch (res.reason) {
    case 'forbidden':
      return 'You don’t have permission to add teams to this event.';
    case 'notfound':
      return 'That event or division no longer exists.';
    case 'conflict':
      return res.message ?? 'A team conflict stopped the save.';
    case 'invalid':
      return res.message ?? 'Some teams couldn’t be saved.';
    default:
      return res.message ?? 'Something went wrong saving the teams.';
  }
}

export function TeamRandomizer({
  initialRoster,
  eventBinding,
  adHocDivisions = [],
}: {
  initialRoster?: string;
  eventBinding?: EventBindingView;
  adHocDivisions?: ReadonlyArray<{ id: string; label: string }>;
} = {}) {
  const [roster, setRoster] = useState(initialRoster ?? '');
  const [teamCount, setTeamCount] = useState(2);
  const [mode, setMode] = useState<SplitMode>('random');
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [divisionId, setDivisionId] = useState(adHocDivisions[0]?.id ?? '');
  const [saveResult, setSaveResult] = useState<SaveTeamsResult | null>(null);
  const [saving, startSave] = useTransition();

  // `parseRoster` is pure, so deriving it during render is safe under the
  // React Compiler — only the shuffle (in `make()`) touches `Math.random`.
  const players = parseRoster(roster);
  const rated = hasRatings(players);
  const canMake = players.length >= 2;
  const maxTeams = Math.max(2, players.length);

  function make() {
    if (!canMake) return;
    const n = Math.max(2, Math.min(teamCount, players.length));
    setTeams(splitTeams(players, n, mode));
    setCopied(false);
    setSaveResult(null);
  }

  function copy() {
    if (!teams) return;
    void navigator.clipboard?.writeText(formatTeamsText(teams));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  function saveToEvent() {
    if (!eventBinding || !teams || !divisionId) return;
    setSaveResult(null);
    startSave(async () => {
      const res = await saveRandomTeamsToEvent({
        eventId: eventBinding.eventId,
        divisionId,
        ret: eventBinding.ret,
        teams: teams.map((t, i) => ({
          name: `Team ${i + 1}`,
          players: t.players.map((p) => p.name),
        })),
      });
      setSaveResult(res);
    });
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

      <div className="border-border-base rounded-shape-sm space-y-5 border p-5">
        <div>
          <label htmlFor="roster" className={labelClass}>
            Players
          </label>
          <textarea
            id="roster"
            value={roster}
            onChange={(e) => {
              setRoster(e.target.value);
              setTeams(null);
            }}
            rows={8}
            placeholder={'Alex\nBo\nCara\nDev…'}
            className={`${inputClass} resize-y font-mono`}
          />
          <p className={hintClass}>
            One name per line. Add an optional skill rating after a name to balance teams — e.g.{' '}
            <span className="font-mono">Alex 5</span> or <span className="font-mono">Bo, 3</span>.{' '}
            {players.length > 0
              ? `${players.length} player${players.length === 1 ? '' : 's'}.`
              : ''}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="teamCount" className={labelClass}>
              Number of teams
            </label>
            <input
              id="teamCount"
              type="number"
              min={2}
              max={maxTeams}
              value={teamCount}
              onChange={(e) => {
                setTeamCount(Number(e.target.value) || 2);
                setTeams(null);
              }}
              className={inputClass}
            />
          </div>
          <div>
            <span className={labelClass}>Split</span>
            <div className="mt-1 flex gap-2" role="group" aria-label="Split mode">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  aria-pressed={mode === m.value}
                  onClick={() => {
                    setMode(m.value);
                    setTeams(null);
                  }}
                  className={mode === m.value ? tonalButtonClass('md') : neutralButtonClass('md')}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {mode === 'balanced' && players.length > 0 && !rated ? (
          <p className={hintClass}>
            No skill ratings detected — this will behave like Random. Add a number after a name to
            balance teams.
          </p>
        ) : null}

        <div className="border-border-base border-t pt-4">
          <button
            type="button"
            onClick={make}
            disabled={!canMake}
            className={`${primaryButtonClass('md')} w-full`}
          >
            {teams ? 'Reshuffle teams' : 'Make teams'}
          </button>
          {!canMake ? (
            <p className="text-muted mt-2 text-center text-xs">Add at least 2 players.</p>
          ) : null}
        </div>
      </div>

      {teams ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-fg text-lg font-semibold">{teams.length} teams</h2>
            <button type="button" onClick={copy} className={neutralButtonClass('sm')}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((team, i) => {
              const summary = teamSummary(team);
              return (
                <li
                  key={i}
                  className="border-border-base rounded-shape-sm flex flex-col border p-4"
                >
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <h3 className="text-fg font-semibold">Team {i + 1}</h3>
                    <span className="text-muted text-xs">
                      {summary.count} player{summary.count === 1 ? '' : 's'}
                      {summary.avg !== null ? ` · avg ${summary.avg.toFixed(1)}` : ''}
                    </span>
                  </div>
                  <ul className="space-y-1 text-sm">
                    {team.players.map((p, j) => (
                      <li key={j} className="flex items-center justify-between gap-2">
                        <span className="text-fg">{p.name}</span>
                        {p.rating !== undefined ? (
                          <span className="bg-fg/5 text-muted shrink-0 rounded px-1.5 py-0.5 text-xs">
                            {p.rating}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>

          {eventBinding ? (
            <div className="border-border-base rounded-shape-sm space-y-3 border p-4">
              <p className="text-fg text-sm font-medium">Save these teams to your event</p>
              {adHocDivisions.length === 0 ? (
                <p className="text-muted text-xs">
                  Add an <span className="font-medium">ad-hoc</span> division on the event to save
                  these as teams.
                </p>
              ) : (
                <>
                  {adHocDivisions.length > 1 ? (
                    <div>
                      <label htmlFor="save-division" className={labelClass}>
                        Division
                      </label>
                      <select
                        id="save-division"
                        value={divisionId}
                        onChange={(e) => setDivisionId(e.target.value)}
                        className={inputClass}
                      >
                        {adHocDivisions.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={saveToEvent}
                    disabled={saving || !divisionId}
                    className={`${primaryButtonClass('md')} w-full`}
                  >
                    {saving
                      ? 'Saving…'
                      : `Save ${teams.length} team${teams.length === 1 ? '' : 's'} as ad-hoc teams`}
                  </button>
                  {saveResult?.ok ? (
                    <p className="text-md-success text-sm">
                      Created {saveResult.created} team{saveResult.created === 1 ? '' : 's'} on the
                      event. They’ll appear in the bracket’s registered teams.
                    </p>
                  ) : saveResult ? (
                    <p className="text-md-error text-sm">{saveError(saveResult)}</p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
