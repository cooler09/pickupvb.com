'use client';

import dynamic from 'next/dynamic';

/**
 * Client-only wrapper around `<EventMap>`. Lives here (not in the server
 * `page.tsx`) because Next 16 disallows `next/dynamic` with `ssr: false`
 * inside server components — the hint must come from a client boundary.
 */
const EventMap = dynamic(() => import('@/components/event-map'), {
    ssr: false,
    loading: () => (
        <div className="h-[320px] w-full animate-pulse rounded-lg bg-fg/5" />
    ),
});

export default EventMap;
