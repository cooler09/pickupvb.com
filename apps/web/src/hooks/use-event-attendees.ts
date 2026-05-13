'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';

/**
 * Subscribes to attendee changes for a single event so the UI can show
 * live spot counts to everyone viewing the event detail page.
 */
export function useEventAttendees(eventId: string, initialCount = 0) {
    const [count, setCount] = useState(initialCount);

    useEffect(() => {
        const supabase = createSupabaseBrowserClient();
        const channel = supabase
            .channel(`event-attendees:${eventId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'event_attendees', filter: `event_id=eq.${eventId}` },
                (payload) => {
                    if (payload.eventType === 'INSERT') setCount((c) => c + 1);
                    else if (payload.eventType === 'DELETE') setCount((c) => Math.max(0, c - 1));
                },
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [eventId]);

    return count;
}
