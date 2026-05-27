'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';

/**
 * Subscribes to bracket changes for one division and triggers a server
 * re-render whenever the bracket is created/regenerated/reset or a match
 * result lands. Mirrors the pattern in
 * `apps/web/src/hooks/use-event-attendees.ts`.
 *
 * The host (or co-host) doing the mutation sees their own refresh via the
 * server action's `revalidatePath`; this component is what brings every
 * other viewer along.
 */
export function BracketRealtimeRefresher({
  divisionId,
  bracketId,
}: {
  divisionId: string;
  bracketId: string | null;
}) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let channel = supabase.channel(`bracket:${divisionId}`).on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'tournament_brackets',
        filter: `division_id=eq.${divisionId}`,
      },
      () => router.refresh(),
    );

    if (bracketId) {
      channel = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bracket_matches',
          filter: `bracket_id=eq.${bracketId}`,
        },
        () => router.refresh(),
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [divisionId, bracketId, router]);

  return null;
}
