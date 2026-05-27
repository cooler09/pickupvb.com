/**
 * 4-char room codes for ephemeral scoreboard rooms.
 *
 * Alphabet excludes visually-ambiguous chars (0/O, 1/I/L). ~1.4M combos —
 * collision risk is fine because there's no data at rest to leak: the
 * channel is a Supabase Realtime broadcast (pub/sub only), so two hosts
 * landing on the same code would just see each other's increments,
 * which is non-destructive and easily resolved by starting a new game.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 4;

export function generateRoomCode(): string {
  let out = '';
  const buf = new Uint32Array(CODE_LEN);
  globalThis.crypto.getRandomValues(buf);
  for (let i = 0; i < CODE_LEN; i += 1) {
    out += ALPHABET[buf[i]! % ALPHABET.length];
  }
  return out;
}

export function isValidRoomCode(input: string): boolean {
  if (input.length !== CODE_LEN) return false;
  for (const ch of input) {
    if (!ALPHABET.includes(ch)) return false;
  }
  return true;
}

export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase();
}
