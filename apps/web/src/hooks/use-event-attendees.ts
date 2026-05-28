'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';

/**
 * Subscribes to attendee changes for a single event so the UI can show
 * live spot counts to everyone viewing the event detail page.
 *
 * Watches `event_participants` directly and filters callbacks by
 * role='attendee'. The `in` filter on `division_id` scopes the
 * channel to rows that could plausibly belong to this event.
 */
export function useEventAttendees(eventId: string, initialCount = 0) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: divRows } = await supabase
        .from('event_divisions')
        .select('id')
        .eq('event_id', eventId);
      if (cancelled) return;
      const divisionIds = ((divRows as Array<{ id: string }> | null) ?? []).map((r) => r.id);
      if (divisionIds.length === 0) return;

      channel = supabase
        .channel(`event-attendees:${eventId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'event_participants',
            filter: `division_id=in.(${divisionIds.join(',')})`,
          },
          (payload) => {
            const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as
              | { role?: string }
              | null
              | undefined;
            if (row?.role !== 'attendee') return;
            if (payload.eventType === 'INSERT') setCount((c) => c + 1);
            else if (payload.eventType === 'DELETE') setCount((c) => Math.max(0, c - 1));
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [eventId]);

  return count;
}
