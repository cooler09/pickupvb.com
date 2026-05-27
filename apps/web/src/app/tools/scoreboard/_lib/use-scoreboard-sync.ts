'use client';

/**
 * Realtime scoreboard sync over Supabase broadcast channels.
 *
 * No DB rows, no auth, no RLS — pure pub/sub on `scoreboard:{code}`.
 * Both the full-screen scoreboard and the mobile remote use this hook.
 *
 * Conflict resolution: last-write-wins by monotonic `version`. Two
 * devices clicking at the same time → the later broadcast overrides.
 * Acceptable for a scoreboard (score correction is one tap away) and
 * keeps the protocol trivial.
 *
 * Late-join: when a new peer joins (`presence sync`), every connected
 * peer rebroadcasts its current state. The peer with the highest
 * `version` wins, so a fresh subscriber catches up within a round-trip
 * without any centralized server.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { loadState, saveState } from './storage.js';
import type { ScoreboardConfig, ScoreboardState } from './types.js';
import { initialState } from './types.js';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

type UseScoreboardSyncResult = {
  state: ScoreboardState;
  setState: (next: ScoreboardState) => void;
  status: ConnectionStatus;
  /** Number of peers connected to the room (including this client). */
  peerCount: number;
};

export function useScoreboardSync(
  code: string,
  fallbackConfig: ScoreboardConfig,
): UseScoreboardSyncResult {
  const [state, setLocalState] = useState<ScoreboardState>(() => {
    const stored = typeof window !== 'undefined' ? loadState(code) : null;
    return stored ?? initialState(fallbackConfig);
  });
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [peerCount, setPeerCount] = useState(1);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const stateRef = useRef(state);
  // Keep the ref in sync with the latest state without reading/writing
  // refs during render (react-hooks/refs). The channel subscription
  // effect below reads `stateRef.current` from inside async callbacks.
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  // re-renders and persists to localStorage on every change.
  const setState = useCallback(
    (next: ScoreboardState) => {
      setLocalState(next);
      saveState(code, next);
      const channel = channelRef.current;
      if (channel) {
        void channel.send({
          type: 'broadcast',
          event: 'state',
          payload: next,
        });
      }
    },
    [code],
  );

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    // Unique presence key per mount; under React strict mode the
    // effect runs twice and Supabase's `removeChannel` is async, so
    // a stable key would collide with a still-tearing-down channel.
    const peerKey = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase.channel(`scoreboard:${code}`, {
      config: { broadcast: { self: false }, presence: { key: peerKey } },
    });
    channelRef.current = channel;

    channel.on('broadcast', { event: 'state' }, (msg) => {
      const incoming = msg.payload as ScoreboardState;
      // Last-write-wins by version. Equal versions: take the
      // newer wall-clock to keep convergence after a tied burst.
      const current = stateRef.current;
      const winsByVersion = incoming.version > current.version;
      const winsByTime =
        incoming.version === current.version && incoming.updatedAt > current.updatedAt;
      if (winsByVersion || winsByTime) {
        setLocalState(incoming);
        saveState(code, incoming);
      }
    });

    channel.on('presence', { event: 'sync' }, () => {
      const presenceState = channel.presenceState();
      const count = Object.keys(presenceState).length;
      setPeerCount(Math.max(1, count));
      // Re-announce our current state so any late joiner with a
      // stale snapshot picks ours up (or is overridden by a peer
      // with a higher version).
      void channel.send({
        type: 'broadcast',
        event: 'state',
        payload: stateRef.current,
      });
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
  }, [code]);

  return { state, setState, status, peerCount };
}
