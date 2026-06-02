/**
 * localStorage persistence for the ephemeral `/tools` rooms, namespaced per
 * tool. `createRoomStorage('scoreboard')` and `createRoomStorage('timer')` each
 * get their own key prefix, so one tool's entries never collide with another's.
 *
 * Retention: entries older than 24h of inactivity (`updatedAt`) are pruned
 * whenever we touch storage. The state shape only needs `updatedAt` — every
 * room state already carries it for last-write-wins (see `use-room-sync.ts`).
 */

export type RoomStorage<T> = {
  loadState: (code: string) => T | null;
  saveState: (code: string, state: T) => void;
  clearState: (code: string) => void;
};

const TTL_MS = 24 * 60 * 60 * 1000;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function createRoomStorage<T extends { updatedAt: number }>(
  namespace: string,
): RoomStorage<T> {
  const prefix = `pickupvb:${namespace}:`;

  function pruneExpired(): void {
    const now = Date.now();
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
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

  return {
    loadState(code: string): T | null {
      if (!isBrowser()) return null;
      try {
        pruneExpired();
        const raw = window.localStorage.getItem(prefix + code);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as T;
        if (Date.now() - parsed.updatedAt > TTL_MS) {
          window.localStorage.removeItem(prefix + code);
          return null;
        }
        return parsed;
      } catch {
        return null;
      }
    },
    saveState(code: string, state: T): void {
      if (!isBrowser()) return;
      try {
        window.localStorage.setItem(prefix + code, JSON.stringify(state));
      } catch {
        // quota exceeded or storage unavailable — silently drop
      }
    },
    clearState(code: string): void {
      if (!isBrowser()) return;
      try {
        window.localStorage.removeItem(prefix + code);
      } catch {
        // ignore
      }
    },
  };
}
