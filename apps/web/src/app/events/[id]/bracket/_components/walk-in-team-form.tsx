'use client';

import { useRef, useState, useTransition } from 'react';
import { primaryButtonClass } from '@/components/primary-button';
import { bindBracketActions } from './bracket-action-binding';
import { useAlertReveal } from '@/components/use-alert-reveal';
import type { BracketScope } from './labels';

/**
 * Host escape hatch for adding walk-in / unregistered teams to a
 * division's bracket. Captures a team name + optional starting roster
 * (player display name and contact email) so the host can record who's
 * actually on court without leaving the bracket page.
 *
 * Built for the common case — a host registering a *handful* of walk-in
 * teams at check-in — so it stays open after each add: on success the
 * fields clear, the team joins a running "added this session" list, and
 * the name input re-focuses for the next entry. The host clicks Done when
 * finished. Submission goes through {@link addWalkInTeam}, a client-invoked
 * server action that returns a typed result (no redirect) and revalidates
 * the bracket page so the seeding list / team count update behind the
 * modal after every add.
 *
 * Player rows carry a stable id so removing a middle row doesn't reshuffle
 * the inputs the host is still typing into.
 *
 * Standalone brackets (ADR 0025) are typed-in names only (no roster), so the
 * binding exposes a `bulkAddTeams` action. When present, a Single / Paste-a-list
 * tab appears: the "Paste a list" mode takes one team name per line and adds the
 * whole batch in one round-trip ({@link addBracketTeamsFromClient}), folding the
 * results into the same "added this session" list.
 */
type PlayerRow = { id: number; name: string; email: string };

const INPUT_CLASS =
  'border-border-base bg-bg text-fg focus:border-primary focus-visible:ring-primary block min-w-0 flex-1 rounded border px-2 py-1 text-sm shadow-sm focus-visible:ring-2 focus-visible:outline-none';

export function WalkInTeamForm(props: {
  /** Event or standalone (ADR 0025) bracket scope. */
  scope: BracketScope;
  /**
   * Optional dismiss callback wired to the Done/Cancel button. Set by
   * `FormModal` consumers so the host can close once they've finished
   * adding teams.
   */
  onClose?: () => void;
  /** Standalone brackets are typed-in names only — hide the roster fields. */
  showRoster?: boolean;
}) {
  const a = bindBracketActions(props.scope);
  const showRoster = props.showRoster ?? true;
  // Bulk "paste a list" is only wired for standalone brackets (typed-in names,
  // no roster). When the binding exposes it, offer a Single / Paste-a-list tab.
  const bulkAddTeams = a.bulkAddTeams;
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [bulkText, setBulkText] = useState('');
  const [teamName, setTeamName] = useState('');
  const nextRowId = useRef(2);
  const [players, setPlayers] = useState<PlayerRow[]>([
    { id: 0, name: '', email: '' },
    { id: 1, name: '', email: '' },
  ]);
  const [added, setAdded] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);
  const errorRef = useAlertReveal(error, Boolean(error));

  const newRow = (): PlayerRow => ({ id: nextRowId.current++, name: '', email: '' });

  const updatePlayer = (id: number, key: 'name' | 'email', value: string) =>
    setPlayers((rows) => rows.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  const addRow = () => setPlayers((rows) => [...rows, newRow()]);
  const removeRow = (id: number) => setPlayers((rows) => rows.filter((r) => r.id !== id));

  const submit = () => {
    const name = teamName.trim();
    if (!name) {
      setError('Team name is required.');
      nameRef.current?.focus();
      return;
    }
    const members = players
      .map((p) => ({ displayName: p.name.trim(), email: p.email.trim() }))
      .filter((p) => p.displayName.length > 0)
      .map((p) =>
        p.email ? { displayName: p.displayName, email: p.email } : { displayName: p.displayName },
      );
    setError(null);
    startTransition(async () => {
      const res = await a.addTeam({ name, members });
      if (res.ok) {
        setAdded((a) => [...a, { id: res.id, name: res.name }]);
        setTeamName('');
        setPlayers([newRow(), newRow()]);
        nameRef.current?.focus();
      } else {
        setError(res.message || 'Could not add the team. Try again.');
      }
    });
  };

  // Paste-a-list submit: one team per line, blanks dropped. The handler also
  // collapses duplicate lines, so we keep the raw split simple here.
  const submitBulk = () => {
    if (!bulkAddTeams) return;
    const names = bulkText
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (names.length === 0) {
      setError('Enter at least one team name, one per line.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await bulkAddTeams(names);
      if (res.ok) {
        setAdded((cur) => [...cur, ...res.added]);
        setBulkText('');
      } else {
        setError(res.message || 'Could not add the teams. Try again.');
      }
    });
  };

  const switchMode = (next: 'single' | 'bulk') => {
    setMode(next);
    setError(null);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (mode === 'bulk') submitBulk();
        else submit();
      }}
      className="space-y-3"
    >
      {added.length > 0 && (
        <div
          aria-live="polite"
          className="border-md-success/30 bg-md-success/10 text-md-success rounded border px-3 py-2 text-xs"
        >
          <p className="font-medium">✓ Added this session ({added.length})</p>
          <ul className="mt-1 space-y-0.5">
            {added.map((t) => (
              <li key={t.id} className="truncate">
                {t.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="border-md-error/30 bg-md-error/10 text-md-error rounded border px-3 py-2 text-xs outline-none"
        >
          {error}
        </p>
      )}

      {bulkAddTeams && (
        <div className="border-border-base inline-flex rounded-md border p-0.5 text-xs">
          {(['single', 'bulk'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              aria-pressed={mode === m}
              className={`rounded px-3 py-1 font-medium ${
                mode === m ? 'bg-primary/10 text-primary' : 'text-fg/70 hover:bg-fg/5'
              }`}
            >
              {m === 'single' ? 'One at a time' : 'Paste a list'}
            </button>
          ))}
        </div>
      )}

      {mode === 'bulk' ? (
        <label className="block">
          <span className="text-fg/80 text-xs font-medium">Team names</span>
          <span className="text-muted mt-0.5 block text-xs">One team per line.</span>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={8}
            autoFocus
            placeholder={'Spikers\nBlock Party\nNet Gains\n…'}
            className="border-border-base bg-bg text-fg focus:border-primary focus-visible:ring-primary mt-1 block w-full rounded border px-2 py-1 text-sm shadow-sm focus-visible:ring-2 focus-visible:outline-none"
          />
        </label>
      ) : (
        <>
          <label className="block">
            <span className="text-fg/80 text-xs font-medium">Team name</span>
            <input
              ref={nameRef}
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              required
              maxLength={80}
              autoFocus
              placeholder="e.g. Block Party"
              className="border-border-base bg-bg text-fg focus:border-primary focus-visible:ring-primary mt-1 block w-full rounded border px-2 py-1 text-sm shadow-sm focus-visible:ring-2 focus-visible:outline-none"
            />
          </label>

          {showRoster && (
            <fieldset className="space-y-2">
              <legend className="text-fg/80 text-xs font-medium">
                Players <span className="text-muted font-normal">(optional)</span>
              </legend>
              {players.map((row, idx) => (
                <div key={row.id} className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => updatePlayer(row.id, 'name', e.target.value)}
                    maxLength={80}
                    placeholder={`Player ${idx + 1} name`}
                    className={INPUT_CLASS}
                  />
                  <input
                    type="email"
                    value={row.email}
                    onChange={(e) => updatePlayer(row.id, 'email', e.target.value)}
                    maxLength={120}
                    placeholder="email (optional)"
                    className={INPUT_CLASS}
                  />
                  {players.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      aria-label={`Remove player ${idx + 1}`}
                      className="border-border-base text-fg/60 hover:bg-fg/5 hover:text-fg tap-target rounded border text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addRow}
                className="border-border-base text-fg/80 hover:bg-fg/5 rounded border border-dashed px-2 py-1 text-xs"
              >
                + Add player
              </button>
            </fieldset>
          )}
        </>
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        {props.onClose && (
          <button
            type="button"
            onClick={props.onClose}
            className="border-border-base text-fg/80 hover:bg-fg/5 rounded-md border px-3 py-1.5 text-sm"
          >
            {added.length > 0 ? 'Done' : 'Cancel'}
          </button>
        )}
        <button
          type="submit"
          disabled={pending || (mode === 'bulk' && bulkText.trim().length === 0)}
          className={primaryButtonClass('sm')}
        >
          {pending
            ? 'Adding…'
            : mode === 'bulk'
              ? 'Add all'
              : added.length > 0
                ? 'Add another'
                : 'Add team'}
        </button>
      </div>
    </form>
  );
}
