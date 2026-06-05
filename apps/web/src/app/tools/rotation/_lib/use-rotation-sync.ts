'use client';

/**
 * Realtime court-rotation sync — a thin wrapper over the shared room-sync engine
 * ([`../../_lib/use-room-sync.ts`](../../_lib/use-room-sync.ts)) pinned to the
 * `'rotation'` namespace and storage. The whole board state is broadcast
 * (last-write-wins), so every device sees the same courts + queue.
 */

import { useRoomSync, type ConnectionStatus } from '../../_lib/use-room-sync.js';
import { createRoomStorage } from '../../_lib/room-storage.js';
import { createRotationState, type RotationState } from './rotation.js';

const rotationStorage = createRoomStorage<RotationState>('rotation');

export type { ConnectionStatus };

export function useRotationSync(code: string, fallbackCourtCount: number) {
  return useRoomSync<RotationState>({
    namespace: 'rotation',
    code,
    createInitial: () => createRotationState(fallbackCourtCount),
    storage: rotationStorage,
  });
}
