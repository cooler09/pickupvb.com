'use client';

/**
 * Generic realtime room sync over Supabase broadcast channels — the shared
 * engine behind the no-signup `/tools` rooms (scoreboard, timer, …).
 *
 * No DB rows, no auth, no RLS — pure pub/sub on `{namespace}:{code}`. State is
 * persisted to localStorage (via the injected {@link RoomStorage}) and
 * mirrored to every connected device.
 *
 * Conflict resolution: last-write-wins by monotonic `version`, with the newer
 * `updatedAt` breaking a tie. Two devices acting at the same instant → the
 * later broadcast overrides. Trivial protocol, good enough for these tools
 * (a wrong update is one tap to correct).
 *
 * Late-join: when a new peer joins (`presence sync`), every connected peer
 * rebroadcasts its current state, so a fresh subscriber catches up within a
 * round-trip without any centralized server.
 *
 * Each room state must carry `{ version, updatedAt }`; tools layer their own
 * fields on top and supply a `createInitial` + `storage`. The randomness here
 * is confined to a per-mount presence key (never a render body).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { RoomStorage } from './room-storage.js';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

/** Every room state is versioned + timestamped for last-write-wins. */
export type RoomState = { version: number; updatedAt: number };

export type UseRoomSyncResult<T> = {
  state: T;
  setState: (next: T) => void;
  status: ConnectionStatus;
  /** Number of peers connected to the room (including this client). */
  peerCount: number;
};

export function useRoomSync<T extends RoomState>(opts: {
  /** Channel + storage namespace, e.g. `'scoreboard'` or `'timer'`. */
  namespace: string;
  code: string;
  /** Fresh state when nothing is in storage. */
  createInitial: () => T;
  /** Stable (module-level) storage adapter for this namespace. */
  storage: RoomStorage<T>;
}): UseRoomSyncResult<T> {
  const { namespace, code, createInitial, storage } = opts;

  const [state, setLocalState] = useState<T>(() => {
    const stored = typeof window !== 'undefined' ? storage.loadState(code) : null;
    return stored ?? createInitial();
  });
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [peerCount, setPeerCount] = useState(1);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const stateRef = useRef(state);
  // Keep the ref in sync with the latest state without reading/writing refs
  // during render (react-hooks/refs). The subscription effect reads
  // `stateRef.current` from inside async callbacks.
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const setState = useCallback(
    (next: T) => {
      setLocalState(next);
      storage.saveState(code, next);
      const channel = channelRef.current;
      if (channel) {
        void channel.send({ type: 'broadcast', event: 'state', payload: next });
      }
    },
    [code, storage],
  );

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    // Unique presence key per mount; under React strict mode the effect runs
    // twice and Supabase's `removeChannel` is async, so a stable key would
    // collide with a still-tearing-down channel.
    const peerKey = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase.channel(`${namespace}:${code}`, {
      config: { broadcast: { self: false }, presence: { key: peerKey } },
    });
    channelRef.current = channel;

    channel.on('broadcast', { event: 'state' }, (msg) => {
      const incoming = msg.payload as T;
      // Last-write-wins by version; equal versions take the newer wall-clock.
      const current = stateRef.current;
      const winsByVersion = incoming.version > current.version;
      const winsByTime =
        incoming.version === current.version && incoming.updatedAt > current.updatedAt;
      if (winsByVersion || winsByTime) {
        setLocalState(incoming);
        storage.saveState(code, incoming);
      }
    });

    channel.on('presence', { event: 'sync' }, () => {
      const presenceState = channel.presenceState();
      const count = Object.keys(presenceState).length;
      setPeerCount(Math.max(1, count));
      // Re-announce our state so a late joiner with a stale snapshot picks ours
      // up (or is overridden by a peer with a higher version).
      void channel.send({ type: 'broadcast', event: 'state', payload: stateRef.current });
    });

    void channel.subscribe((subStatus) => {
      if (subStatus === 'SUBSCRIBED') {
        setStatus('connected');
        void channel.track({ joinedAt: Date.now() });
      } else if (subStatus === 'CHANNEL_ERROR' || subStatus === 'CLOSED') {
        setStatus('disconnected');
      }
    });

    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [namespace, code, storage]);

  return { state, setState, status, peerCount };
}
