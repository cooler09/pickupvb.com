'use client';

import dynamic from 'next/dynamic';

/**
 * Delight #13 (see docs/delight-backlog.md): client-only, lazily-loaded wrapper
 * around `<KeepieUppie>` so the canvas game can be dropped into a shared
 * (server-rendered) surface — e.g. the events empty state — without pulling the
 * game's code into that route's main bundle. The chunk is fetched only when this
 * actually renders. Mirrors the `event-map-lazy.tsx` pattern: Next 16 forbids
 * `next/dynamic({ ssr: false })` inside a server component, so the hint lives
 * behind this client boundary.
 */
const KeepieUppie = dynamic(() => import('./keepie-uppie').then((m) => m.KeepieUppie), {
  ssr: false,
});

export default KeepieUppie;
