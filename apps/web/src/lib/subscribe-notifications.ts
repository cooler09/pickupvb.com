'use client';

import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

/**
 * Shared, ref-counted subscriber to a user's private notifications Broadcast
 * topic (ADR 0027: `notifications:<userId>`, one row per `notifications` INSERT
 * via a DB trigger; RLS authorizes a subscriber to its own topic only).
 *
 * Why shared: the topic must be *exactly* `notifications:<userId>` for the RLS
 * match, so two components can't each open their own channel to it (a second
 * join to the same private topic on one socket is rejected). The header has two
 * such consumers — the {@link NotificationBell} and the live Messages badge —
 * so the single channel lives here, ref-counted, and fans each new row out to
 * every registered listener. Last listener out tears the channel down.
 *
 * Calling `setState` inside the `onRow` callback is the sanctioned external-store
 * pattern (AGENTS.md pattern #5 / React's "subscribe to an external system");
 * it is *not* the flagged mount-time `set-state-in-effect`.
 */

type Entry = {
  channel: RealtimeChannel | null;
  listeners: Set<(row: NotificationRow) => void>;
  refCount: number;
  cancelled: boolean;
};

const registry = new Map<string, Entry>();

export function subscribeToNotifications(
  userId: string,
  onRow: (row: NotificationRow) => void,
): () => void {
  let entry = registry.get(userId);
  if (!entry) {
    const fresh: Entry = { channel: null, listeners: new Set(), refCount: 0, cancelled: false };
    registry.set(userId, fresh);
    entry = fresh;

    const supabase = createSupabaseBrowserClient();
    void (async () => {
      // Private channels carry the user's JWT so the `realtime.messages` SELECT
      // policy can authorize the topic. Set only the INITIAL token here:
      // supabase-js's auth listener forwards every later TOKEN_REFRESHED to
      // `realtime.setAuth` (re-authorizing joined channels, so a long-lived tab
      // keeps receiving across refresh), but it ignores INITIAL_SESSION — so the
      // first token must be set explicitly. Don't add a manual refresh handler
      // (it would duplicate the client's built-in one).
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (fresh.cancelled) return;
      if (session) await supabase.realtime.setAuth(session.access_token);
      if (fresh.cancelled) return;

      fresh.channel = supabase
        .channel(`notifications:${userId}`, { config: { private: true } })
        .on('broadcast', { event: 'INSERT' }, (msg) => {
          const row = (msg.payload as { record?: NotificationRow }).record;
          if (!row) return;
          for (const listener of fresh.listeners) listener(row);
        })
        .subscribe();
    })();
  }

  entry.listeners.add(onRow);
  entry.refCount += 1;

  return () => {
    const e = registry.get(userId);
    if (!e) return;
    e.listeners.delete(onRow);
    e.refCount -= 1;
    if (e.refCount <= 0) {
      e.cancelled = true;
      if (e.channel) {
        const supabase = createSupabaseBrowserClient();
        void supabase.removeChannel(e.channel);
      }
      registry.delete(userId);
    }
  };
}
