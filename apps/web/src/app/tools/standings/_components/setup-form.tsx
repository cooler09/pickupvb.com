'use client';

import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { primaryButtonClass } from '@/components/primary-button';
import { generateRoomCode } from '../../_lib/room-code.js';
import { createRoomStorage } from '../../_lib/room-storage.js';
import { addTeams, createStandingsState, type StandingsState } from '../_lib/standings.js';

// Module-level storage adapter for the 'standings' namespace — must match
// use-standings-sync.ts so a pre-seeded room is picked up by the board on mount.
const standingsStorage = createRoomStorage<StandingsState>('standings');

export function StandingsSetupForm({
  initialTeams = [],
}: {
  /** Event-bound teams to pre-seed the room with (tournament-tools-workflow TT-2). */
  initialTeams?: ReadonlyArray<string>;
} = {}) {
  const router = useRouter();
  const seeded = initialTeams.length > 0;

  function start() {
    const code = generateRoomCode();
    if (seeded) {
      // Pre-seed the new room's localStorage so the board opens populated with
      // the division's teams. `Date.now()` lives in this click handler, not a
      // render body (AGENTS.md pitfall #4).
      standingsStorage.saveState(code, addTeams(createStandingsState(), [...initialTeams]));
    }
    router.push(`/tools/standings/${code}` as Route);
  }

  return (
    <div className="border-border-base rounded-shape-sm space-y-3 border p-5">
      <button type="button" onClick={start} className={`${primaryButtonClass('md')} w-full`}>
        {seeded
          ? `Start standings with ${initialTeams.length} team${initialTeams.length === 1 ? '' : 's'}`
          : 'Start standings'}
      </button>
      <p className="text-muted text-center text-xs">
        You&rsquo;ll get a shareable link — add teams and record results in the room. Open it on any
        device to track the table together.
      </p>
    </div>
  );
}
