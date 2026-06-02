'use client';

import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { primaryButtonClass } from '@/components/primary-button';
import { generateRoomCode } from '../../_lib/room-code.js';

export function StandingsSetupForm() {
  const router = useRouter();

  function start() {
    const code = generateRoomCode();
    router.push(`/tools/standings/${code}` as Route);
  }

  return (
    <div className="border-border-base rounded-shape-sm space-y-3 border p-5">
      <button type="button" onClick={start} className={`${primaryButtonClass('md')} w-full`}>
        Start standings
      </button>
      <p className="text-muted text-center text-xs">
        You&rsquo;ll get a shareable link — add teams and record results in the room. Open it on any
        device to track the table together.
      </p>
    </div>
  );
}
