/**
 * localStorage persistence for scoreboard state, keyed by room code.
 *
 * Retention: entries older than 24h of inactivity are pruned whenever we
 * touch storage. The "New game" button on the scoreboard explicitly
 * deletes the current code's entry. Together this stops a host's tablet
 * from accumulating dead games over a season.
 */
import type { ScoreboardState } from './types.js';

const PREFIX = 'pickupvb:scoreboard:';
const TTL_MS = 24 * 60 * 60 * 1000;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function loadState(code: string): ScoreboardState | null {
  if (!isBrowser()) return null;
  try {
    pruneExpired();
    const raw = window.localStorage.getItem(PREFIX + code);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScoreboardState;
    if (Date.now() - parsed.updatedAt > TTL_MS) {
      window.localStorage.removeItem(PREFIX + code);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(code: string, state: ScoreboardState): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(PREFIX + code, JSON.stringify(state));
  } catch {
    // quota exceeded or storage unavailable — silently drop
  }
}

export function clearState(code: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(PREFIX + code);
  } catch {
    // ignore
  }
}

function pruneExpired(): void {
  const now = Date.now();
  const toRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith(PREFIX)) continue;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { updatedAt?: number };
      if (typeof parsed.updatedAt !== 'number' || now - parsed.updatedAt > TTL_MS) {
        toRemove.push(key);
      }
    } catch {
      toRemove.push(key);
    }
  }
  for (const key of toRemove) {
    window.localStorage.removeItem(key);
  }
}
