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
  /** Event path: subscribe to bracket creation/reset on this division. Omit
   *  for a standalone bracket (ADR 0025), which has no division — there the
   *  header is watched by bracket id and team additions are watched too. */
  divisionId?: string;
  bracketId: string | null;
}) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channelKey = divisionId ?? bracketId ?? 'none';
    let channel = supabase.channel(`bracket:${channelKey}`).on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'event_brackets',
        // Event: watch the division so bracket creation lands too. Standalone:
        // the bracket already exists, so watch its row by id.
        filter: divisionId ? `division_id=eq.${divisionId}` : `id=eq.${bracketId}`,
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
      // Standalone teams live in bracket_teams; refresh on add/remove so the
      // setup seeding list / team count update across tabs.
      if (!divisionId) {
        channel = channel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'bracket_teams',
            filter: `bracket_id=eq.${bracketId}`,
          },
          () => router.refresh(),
        );
      }
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [divisionId, bracketId, router]);

  return null;
}
