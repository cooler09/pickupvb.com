'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { primaryButtonClass } from '@/components/primary-button';
import {
  fieldInputClass as inputClass,
  fieldLabelClass as labelClass,
} from '@/components/field-styles';
import { generateRoomCode } from '../../_lib/room-code.js';

export function RotationSetupForm() {
  const router = useRouter();
  const [courts, setCourts] = useState(1);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const n = Math.max(1, Math.min(courts, 12));
    const code = generateRoomCode();
    router.push(`/tools/rotation/${code}?courts=${n}` as Route);
  }

  return (
    <form onSubmit={onSubmit} className="border-border-base rounded-shape-sm space-y-5 border p-5">
      <div className="sm:w-1/2">
        <label htmlFor="courts" className={labelClass}>
          Courts
        </label>
        <input
          id="courts"
          type="number"
          min={1}
          max={12}
          value={courts}
          onChange={(e) => setCourts(Math.floor(Number(e.target.value)) || 1)}
          className={inputClass}
        />
        <p className="text-muted mt-1 text-xs">
          You can change this later — add teams in the room.
        </p>
      </div>
      <div className="border-border-base border-t pt-4">
        <button type="submit" className={`${primaryButtonClass('md')} w-full`}>
          Start rotation
        </button>
        <p className="text-muted mt-2 text-center text-xs">
          You&rsquo;ll get a shareable link — open it on any device to manage the queue together.
        </p>
      </div>
    </form>
  );
}
