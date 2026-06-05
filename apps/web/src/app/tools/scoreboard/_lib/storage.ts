/**
 * localStorage persistence for scoreboard state, keyed by room code. The
 * mechanism (namespaced prefix, 24h TTL prune) is shared across `/tools` rooms
 * — see [`../../_lib/room-storage.ts`](../../_lib/room-storage.ts). This file
 * pins the `'scoreboard'` namespace and re-exports the same `loadState` /
 * `saveState` / `clearState` names the scoreboard call sites already use.
 */
import { createRoomStorage } from '../../_lib/room-storage.js';
import type { ScoreboardState } from './types.js';

export const scoreboardStorage = createRoomStorage<ScoreboardState>('scoreboard');
export const { loadState, saveState, clearState } = scoreboardStorage;
