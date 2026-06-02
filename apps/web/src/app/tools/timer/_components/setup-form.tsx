'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import {
  primaryButtonClass,
  neutralButtonClass,
  tonalButtonClass,
} from '@/components/primary-button';
import {
  fieldInputClass as inputClass,
  fieldLabelClass as labelClass,
} from '@/components/field-styles';
import { generateRoomCode } from '../../_lib/room-code.js';

const PRESETS = [8, 10, 12, 15, 20, 25];

export function TimerSetupForm() {
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [minutes, setMinutes] = useState(10);
  const [seconds, setSeconds] = useState(0);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const m = Math.max(0, Math.min(minutes, 999));
    const s = Math.max(0, Math.min(seconds, 59));
    if (m === 0 && s === 0) return;
    const code = generateRoomCode();
    const params = new URLSearchParams({ m: String(m), s: String(s) });
    if (label.trim()) params.set('l', label.trim().slice(0, 40));
    router.push(`/tools/timer/${code}?${params.toString()}` as Route);
  }

  return (
    <form onSubmit={onSubmit} className="border-border-base rounded-shape-sm space-y-5 border p-5">
      <div>
        <label htmlFor="label" className={labelClass}>
          Label <span className="text-muted font-normal">(optional)</span>
        </label>
        <input
          id="label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={40}
          placeholder="Pool play"
          className={inputClass}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="minutes" className={labelClass}>
            Minutes
          </label>
          <input
            id="minutes"
            type="number"
            min={0}
            max={999}
            value={minutes}
            onChange={(e) => setMinutes(Math.floor(Number(e.target.value)) || 0)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="seconds" className={labelClass}>
            Seconds
          </label>
          <input
            id="seconds"
            type="number"
            min={0}
            max={59}
            value={seconds}
            onChange={(e) => setSeconds(Math.floor(Number(e.target.value)) || 0)}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <span className={labelClass}>Quick set</span>
        <div className="mt-1 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={minutes === p && seconds === 0}
              onClick={() => {
                setMinutes(p);
                setSeconds(0);
              }}
              className={
                minutes === p && seconds === 0 ? tonalButtonClass('sm') : neutralButtonClass('sm')
              }
            >
              {p} min
            </button>
          ))}
        </div>
      </div>

      <div className="border-border-base border-t pt-4">
        <button type="submit" className={`${primaryButtonClass('md')} w-full`}>
          Start timer
        </button>
        <p className="text-muted mt-2 text-center text-xs">
          You&rsquo;ll get a shareable link — open it on any device to see the same countdown.
        </p>
      </div>
    </form>
  );
}
