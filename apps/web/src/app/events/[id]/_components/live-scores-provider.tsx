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
  divisionIds,
  bracketId,
  children,
}: {
  enabled: boolean;
  /** Event path: subscribe to all live scores under this division. */
  divisionId?: string;
  /** Multi-division surfaces (court board / dashboard): subscribe to every
   *  division at once. Takes precedence over `divisionId` when non-empty. */
  divisionIds?: string[];
  /** Standalone bracket (ADR 0025): subscribe by bracket_id instead. */
  bracketId?: string;
  children: ReactNode;
}) {
  const [scores, setScores] = useState<LiveScoreMap>(() => new Map());

  // Stable dependency key so a fresh `divisionIds` array literal each render
  // (the page passes `divisions.map(...)`) doesn't churn the subscription.
  const divisionsKey =
    divisionIds && divisionIds.length > 0 ? [...divisionIds].sort().join(',') : '';

  useEffect(() => {
    if (!enabled) return;
    // Target: an explicit multi-division list wins, else a single division
    // (bracket / standings), else a standalone bracket id (ADR 0025). Both
    // columns carry REPLICA IDENTITY FULL so DELETE/UPDATE match the non-PK
    // filter; INSERT/UPDATE deliver regardless via the new-row image.
    const divisions = divisionsKey ? divisionsKey.split(',') : divisionId ? [divisionId] : [];
    const useBracket = divisions.length === 0 && !!bracketId;
    if (divisions.length === 0 && !useBracket) return;

    const supabase = createSupabaseBrowserClient();
    let cancelled = false;

    const onChange = (payload: { eventType: string; new: unknown; old: unknown }) => {
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
    };

    let channel = supabase.channel(
      divisions.length
        ? `live-scores:divisions:${divisionsKey || divisionId}`
        : `live-scores:bracket:${bracketId}`,
    );
    if (divisions.length) {
      // One listener per division on a single channel (no reliance on the `in`
      // filter); all feed the same match-keyed map.
      for (const dv of divisions) {
        channel = channel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'match_live_scores',
            filter: `division_id=eq.${dv}`,
          },
          onChange,
        );
      }
    } else {
      channel = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_live_scores',
          filter: `bracket_id=eq.${bracketId}`,
        },
        onChange,
      );
    }
    channel.subscribe();

    // Initial snapshot so matches already in progress show immediately, not
    // only after their next point.
    void (async () => {
      const base = supabase.from('match_live_scores').select('match_id, live_state');
      const { data } = await (divisions.length
        ? base.in('division_id', divisions)
        : base.eq('bracket_id', bracketId!));
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
  }, [enabled, divisionId, divisionsKey, bracketId]);

  return <LiveScoresContext.Provider value={scores}>{children}</LiveScoresContext.Provider>;
}
