'use client';

/**
 * Realtime timer sync — a thin wrapper over the shared room-sync engine
 * ([`../../_lib/use-room-sync.ts`](../../_lib/use-room-sync.ts)) pinned to the
 * `'timer'` namespace and storage. Only timer *transitions* travel over the
 * channel; each device derives the live countdown locally (see `timer.ts`).
 */

import { useRoomSync, type ConnectionStatus } from '../../_lib/use-room-sync.js';
import { createRoomStorage } from '../../_lib/room-storage.js';
import { createTimerState, type TimerConfig, type TimerState } from './timer.js';

const timerStorage = createRoomStorage<TimerState>('timer');

export type { ConnectionStatus };

export function useTimerSync(code: string, fallbackConfig: TimerConfig) {
  return useRoomSync<TimerState>({
    namespace: 'timer',
    code,
    createInitial: () => createTimerState(fallbackConfig),
    storage: timerStorage,
  });
}
