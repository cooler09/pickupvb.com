'use client';

import dynamic from 'next/dynamic';

/**
 * Client-only wrapper around <CommunityMap>. Lives at a client boundary
 * because Next 16 disallows `next/dynamic({ ssr: false })` inside a server
 * component — and Leaflet must never render on the server. Mirrors
 * `app/events/[id]/_components/event-map-lazy.tsx`.
 */
const CommunityMap = dynamic(() => import('./community-map'), {
  ssr: false,
  loading: () => (
    <div className="rounded-shape-sm bg-fg/5 h-[70vh] min-h-[420px] w-full animate-pulse" />
  ),
});

export default CommunityMap;
