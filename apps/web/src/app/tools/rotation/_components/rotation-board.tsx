'use client';

import { useState, type FormEvent } from 'react';
import { primaryButtonClass, neutralButtonClass } from '@/components/primary-button';
import { fieldInputClass as inputClass } from '@/components/field-styles';
import { useRotationSync } from '../_lib/use-rotation-sync.js';
import {
  addTeams,
  removeTeam,
  reportWin,
  clearCourt,
  setCourtCount,
  teamCount,
  formatRotationText,
  type RotationState,
  type Side,
} from '../_lib/rotation.js';

export function RotationBoard({
  code,
  initialCourtCount,
}: {
  code: string;
  initialCourtCount: number;
}) {
  const { state, setState, status, peerCount } = useRotationSync(code, initialCourtCount);
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);

  function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const names = draft.split(/[\n,]+/);
    setState(addTeams(state, names));
    setDraft('');
  }

  function copyLink() {
    void navigator.clipboard?.writeText(`${window.location.origin}/tools/rotation/${code}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  const total = teamCount(state);
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
            · {peerCount} {peerCount === 1 ? 'device' : 'devices'} · {total} team
            {total === 1 ? '' : 's'}
          </span>
        </span>
        <div className="flex items-center gap-2">
          <CourtStepper
            count={state.courtCount}
            onChange={(n) => setState(setCourtCount(state, n))}
          />
          <button type="button" onClick={copyLink} className={neutralButtonClass('sm')}>
            {copied ? 'Copied!' : 'Share link'}
          </button>
        </div>
      </div>

      <form onSubmit={onAdd} className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a team or player — or paste comma-separated"
          aria-label="Add team"
          className={inputClass}
        />
        <button type="submit" className={`${primaryButtonClass('md')} shrink-0`}>
          Add
        </button>
      </form>

      <ul className="grid gap-3 sm:grid-cols-2">
        {state.courts.map((court, i) => (
          <li key={i} className="border-border-base rounded-shape-sm border p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-fg font-semibold">Court {i + 1}</h2>
              {court.a || court.b ? (
                <button
                  type="button"
                  onClick={() => setState(clearCourt(state, i))}
                  className="text-muted hover:text-fg text-xs"
                >
                  Both out
                </button>
              ) : null}
            </div>
            <CourtBody
              court={court}
              onWin={(side) => setState(reportWin(state, i, side))}
              onRemove={(name) => setState(removeTeam(state, name))}
            />
          </li>
        ))}
      </ul>

      <div className="space-y-2">
        <h2 className="text-fg text-sm font-semibold tracking-wide uppercase">
          Up next{state.queue.length > 0 ? ` (${state.queue.length})` : ''}
        </h2>
        {state.queue.length === 0 ? (
          <p className="text-muted text-sm">No teams waiting. Add teams to fill the courts.</p>
        ) : (
          <ol className="divide-border-base border-border-base rounded-shape-sm divide-y border">
            {state.queue.map((name, i) => (
              <li
                key={`${name}-${i}`}
                className="flex items-center justify-between gap-2 px-3 py-2"
              >
                <span className="text-fg text-sm">
                  <span className="text-muted tabular-nums">{i + 1}.</span> {name}
                </span>
                <button
                  type="button"
                  onClick={() => setState(removeTeam(state, name))}
                  className="text-muted hover:text-fg text-sm"
                  aria-label={`Remove ${name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      {state.courts.some((c) => c.a && c.b) ? (
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(formatRotationText(state));
          }}
          className={neutralButtonClass('sm')}
        >
          Copy board
        </button>
      ) : null}
    </div>
  );
}

function CourtBody({
  court,
  onWin,
  onRemove,
}: {
  court: RotationState['courts'][number];
  onWin: (side: Side) => void;
  onRemove: (name: string) => void;
}) {
  if (!court.a && !court.b) {
    return <p className="text-muted text-sm">Open — add teams to fill this court.</p>;
  }
  const bothReady = court.a !== null && court.b !== null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <TeamSlot name={court.a} ready={bothReady} onWin={() => onWin('a')} onRemove={onRemove} />
        <span className="text-muted shrink-0 text-xs">vs</span>
        <TeamSlot name={court.b} ready={bothReady} onWin={() => onWin('b')} onRemove={onRemove} />
      </div>
      <p className="text-muted text-xs">
        {bothReady
          ? 'Tap the winner — they stay on, loser goes to the back.'
          : 'Waiting for an opponent…'}
      </p>
    </div>
  );
}

function TeamSlot({
  name,
  ready,
  onWin,
  onRemove,
}: {
  name: string | null;
  ready: boolean;
  onWin: () => void;
  onRemove: (name: string) => void;
}) {
  if (name === null) {
    return (
      <span className="border-border-base text-muted flex-1 rounded-md border border-dashed px-3 py-2 text-center text-sm">
        Open
      </span>
    );
  }
  if (!ready) {
    return (
      <span className="border-border-base bg-fg/5 flex flex-1 items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
        <span className="text-fg">{name}</span>
        <button
          type="button"
          onClick={() => onRemove(name)}
          className="text-muted hover:text-fg"
          aria-label={`Remove ${name}`}
        >
          ✕
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onWin}
      className={`${neutralButtonClass('md')} flex-1 justify-center`}
    >
      {name}
    </button>
  );
}

function CourtStepper({ count, onChange }: { count: number; onChange: (n: number) => void }) {
  return (
    <span className="flex items-center gap-1.5 text-sm">
      <span className="text-muted">Courts</span>
      <button
        type="button"
        onClick={() => onChange(count - 1)}
        disabled={count <= 1}
        className={`${neutralButtonClass('sm')} px-2.5`}
        aria-label="Fewer courts"
      >
        −
      </button>
      <span className="text-fg w-4 text-center font-semibold tabular-nums">{count}</span>
      <button
        type="button"
        onClick={() => onChange(count + 1)}
        disabled={count >= 12}
        className={`${neutralButtonClass('sm')} px-2.5`}
        aria-label="More courts"
      >
        +
      </button>
    </span>
  );
}
