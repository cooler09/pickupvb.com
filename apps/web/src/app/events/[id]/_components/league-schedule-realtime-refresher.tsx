'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';

/**
 * Subscribes to one league division's schedule and triggers a server re-render
 * whenever a match is added / edited / has a result recorded, so spectator
 * surfaces (the schedule page, the court board, the dashboard) update live
 * across viewers — the league counterpart to {@link BracketRealtimeRefresher}.
 *
 * The host doing the mutation sees their own refresh via the server action's
 * `revalidatePath`; this brings every other viewer along. `league_schedule_matches`
 * is already in the `supabase_realtime` publication with a public select policy
 * (20260803000000); INSERT/UPDATE deliver via the new-row image, and DELETE once
 * REPLICA IDENTITY FULL ships (20261008000000).
 */
export function LeagueScheduleRealtimeRefresher({ divisionId }: { divisionId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`league-schedule:${divisionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'league_schedule_matches',
          filter: `division_id=eq.${divisionId}`,
        },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [divisionId, router]);

  return null;
}
