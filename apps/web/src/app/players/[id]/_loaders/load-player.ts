import { cache } from 'react';
import { SupabaseProfileRepository } from '@pickupvb/infrastructure';
import { createSupabaseAnonClient } from '@pickupvb/supabase/anon';

/**
 * Per-request memoized read of the public player profile by handle (PUB-12).
 * `generateMetadata` and the page component run in the **same request**, so
 * wrapping the `profiles_public` read in `React.cache` collapses what were two
 * identical queries into one on a cache MISS. `PLAYER_COLUMNS` now also carries
 * `discoverable`, so metadata reads the noindex flag off this same row instead
 * of issuing its own `findCardByHandle`. The OG route is a separate render and
 * reads independently (it can't share this request-scoped cache).
 */
export const getPlayerByHandle = cache((handle: string) =>
  new SupabaseProfileRepository(createSupabaseAnonClient()).findPlayerByHandle(handle),
);
