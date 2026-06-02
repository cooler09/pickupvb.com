'use client';

/**
 * Realtime scoreboard sync — a thin wrapper over the shared room-sync engine
 * ([`../../_lib/use-room-sync.ts`](../../_lib/use-room-sync.ts)) pinned to the
 * `'scoreboard'` namespace and storage. The last-write-wins protocol,
 * late-join re-announce, and presence/peer counting all live in the shared
 * hook; this file just supplies the scoreboard's initial-state factory.
 */

import { useRoomSync, type ConnectionStatus } from '../../_lib/use-room-sync.js';
import { scoreboardStorage } from './storage.js';
import { initialState } from './types.js';
import type { ScoreboardConfig, ScoreboardState } from './types.js';

export type { ConnectionStatus };

export function useScoreboardSync(code: string, fallbackConfig: ScoreboardConfig) {
  return useRoomSync<ScoreboardState>({
    namespace: 'scoreboard',
    code,
    createInitial: () => initialState(fallbackConfig),
    storage: scoreboardStorage,
  });
}
