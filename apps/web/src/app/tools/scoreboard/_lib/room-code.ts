/**
 * Room codes for scoreboard rooms. The implementation is shared across all
 * `/tools` rooms — see [`../../_lib/room-code.ts`](../../_lib/room-code.ts).
 * Re-exported here so the scoreboard's existing import paths stay stable.
 */
export { generateRoomCode, isValidRoomCode, normalizeRoomCode } from '../../_lib/room-code.js';
