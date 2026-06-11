'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { primaryButtonClass } from '@/components/primary-button';
import {
  fieldInputClass as inputClass,
  fieldLabelClass as labelClass,
} from '@/components/field-styles';
import { isValidRoomCode, normalizeRoomCode } from '../_lib/room-code.js';

/**
 * "Join with a code" entry point for players keeping score from their phone.
 * The host (or a team captain) launches a scoreboard from a match — it shows a
 * 4-char room code and a shareable remote link — and reads/posts the code at the
 * gym. Anyone who types it here lands on the realtime **remote** for that room
 * and can tap to keep the live tally in sync (saving the official result stays
 * host/captain-gated). Validates the code locally so a typo doesn't deposit the
 * user on a dead room (the `/s/{code}` alias 404s an invalid code anyway).
 */
export function ScoreboardJoinForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const normalized = normalizeRoomCode(code);
    if (!isValidRoomCode(normalized)) {
      setError('Enter the 4-character code shown on the scoreboard.');
      return;
    }
    router.push(`/tools/scoreboard/${normalized}/remote` as Route);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="border-border-base rounded-shape-sm space-y-3 border border-dashed p-5"
    >
      <div>
        <label htmlFor="join-code" className={labelClass}>
          Keep score from your phone
        </label>
        <p className="text-muted mb-2 text-xs">
          Got a code from the host? Enter it to open the remote and tap to score.
        </p>
        <div className="flex gap-2">
          <input
            id="join-code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              if (error) setError(null);
            }}
            maxLength={4}
            autoCapitalize="characters"
            autoComplete="off"
            inputMode="text"
            placeholder="ABCD"
            aria-describedby={error ? 'join-code-error' : undefined}
            className={`${inputClass} font-mono text-lg tracking-[0.3em] uppercase`}
          />
          <button type="submit" className={primaryButtonClass('md')}>
            Join
          </button>
        </div>
        {error && (
          <p id="join-code-error" role="alert" className="text-md-error mt-2 text-xs">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
