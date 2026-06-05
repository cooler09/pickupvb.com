'use client';

/**
 * Realtime standings sync — a thin wrapper over the shared room-sync engine
 * ([`../../_lib/use-room-sync.ts`](../../_lib/use-room-sync.ts)) pinned to the
 * `'standings'` namespace and storage. The whole table state (teams + results)
 * is broadcast last-write-wins, so every device sees the same standings and
 * anyone can record a result.
 */

import { useRoomSync, type ConnectionStatus } from '../../_lib/use-room-sync.js';
import { createRoomStorage } from '../../_lib/room-storage.js';
import { createStandingsState, type StandingsState } from './standings.js';

const standingsStorage = createRoomStorage<StandingsState>('standings');

export type { ConnectionStatus };

export function useStandingsSync(code: string) {
  return useRoomSync<StandingsState>({
    namespace: 'standings',
    code,
    createInitial: () => createStandingsState(),
    storage: standingsStorage,
  });
}
