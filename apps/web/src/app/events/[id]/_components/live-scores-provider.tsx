'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';
import type { LiveMatchScore } from '@pickupvb/domain';

/**
 * Public live-score subscription (ADR 0023 Phase 5, read side).
 *
 * One realtime subscription per division: every viewer of the bracket /
 * standings watches `match_live_scores` filtered by `division_id` and gets the
 * in-progress score of any match being scored on the scoreboard right now. A
 * single channel + a context map (keyed by `match_id`) keeps it to one
 * subscription per page instead of one per match — the reason the table carries
 * a denormalized `division_id` with `REPLICA IDENTITY FULL` (so DELETE/UPDATE
 * events match the non-PK filter).
 *
 * Gated by `enabled` (= the event host is Pro): when false the provider is inert
 * — no subscription, empty map — so live scores only ever surface for Pro-host
 * events, regardless of what rows exist. Consumers read via {@link useLiveScore}
 * and render nothing when there's no live row, so they're safe to drop into any
 * match card unconditionally.
 */
type LiveScoreMap = ReadonlyMap<string, LiveMatchScore>;

const LiveScoresContext = createContext<LiveScoreMap>(new Map());

export function useLiveScore(matchId: string): LiveMatchScore | null {
  return useContext(LiveScoresContext).get(matchId) ?? null;
}

type LiveRow = { match_id: string; live_state: unknown };

export function LiveScoresProvider({
  enabled,
  divisionId,
  children,
}: {
  enabled: boolean;
  divisionId: string;
  children: ReactNode;
}) {
  const [scores, setScores] = useState<LiveScoreMap>(() => new Map());

  useEffect(() => {
    if (!enabled) return;
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;

    const channel = supabase.channel(`live-scores:${divisionId}`).on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'match_live_scores',
        filter: `division_id=eq.${divisionId}`,
      },
      (payload) => {
        setScores((prev) => {
          const next = new Map(prev);
          if (payload.eventType === 'DELETE') {
            const old = payload.old as Partial<LiveRow>;
            if (old.match_id) next.delete(old.match_id);
          } else {
            const row = payload.new as LiveRow;
            next.set(row.match_id, row.live_state as LiveMatchScore);
          }
          return next;
        });
      },
    );
    channel.subscribe();

    // Initial snapshot so matches already in progress show immediately, not
    // only after their next point.
    void (async () => {
      const { data } = await supabase
        .from('match_live_scores')
        .select('match_id, live_state')
        .eq('division_id', divisionId);
      if (cancelled || !data) return;
      setScores((prev) => {
        const next = new Map(prev);
        for (const row of data as LiveRow[]) {
          next.set(row.match_id, row.live_state as LiveMatchScore);
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [enabled, divisionId]);

  return <LiveScoresContext.Provider value={scores}>{children}</LiveScoresContext.Provider>;
}
