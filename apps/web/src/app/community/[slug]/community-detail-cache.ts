/**
 * Cached, viewer-independent community-listing detail read (audit CL-12).
 *
 * The anonymous (`viewerId = null`) read model is identical for every logged-out
 * visitor and every crawler — and `getCommunityListingDetail` runs on the admin
 * client, so RLS doesn't vary by caller. We wrap it in `unstable_cache` with a
 * 60s window so anonymous traffic (the SEO/share target) serves without a
 * Supabase round-trip on a warm cache. Logged-in viewers skip this cache and get
 * a fresh viewer-scoped read (`canManage` / `hasReported` / own-hidden).
 *
 * Mutating actions evict via `updateTag(communityListingCacheTag(slug))`; the
 * 60s TTL is the backstop for the one writer without a slug (the auto-approve
 * cron). Mirrors `loadEventReadModelPublic` — including the `Date` revival,
 * since `unstable_cache` JSON-flattens every `Date` to an ISO string on read.
 *
 * Never call `cookies()` inside the cache callback (Next 16 forbids it); the
 * read is viewer-independent so the service-role path is safe.
 */
import { unstable_cache } from 'next/cache';
import { GetCommunityListingDetailQuery } from '@pickupvb/application';
import { NotFoundError, type CommunityListingDetailReadModel } from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { communityListingCacheTag } from '@/lib/cache-tags';

export async function loadCommunityDetailPublic(
  slug: string,
): Promise<CommunityListingDetailReadModel | null> {
  const cached = await unstable_cache(
    async () => {
      try {
        return await handlers.getCommunityListingDetail.execute(
          new GetCommunityListingDetailQuery(slug, null),
        );
      } catch (err) {
        if (err instanceof NotFoundError) return null;
        throw err;
      }
    },
    ['community-listing-detail-public', slug],
    { revalidate: 60, tags: [communityListingCacheTag(slug)] },
  )();
  return cached ? reviveDates(cached) : null;
}

/** Re-hydrate every `Date` field `unstable_cache` flattened to a string. */
function reviveDates(m: CommunityListingDetailReadModel): CommunityListingDetailReadModel {
  const toDate = (v: unknown): Date => new Date(v as string);
  const toDateOrNull = (v: unknown): Date | null => (v == null ? null : new Date(v as string));
  return {
    ...m,
    startsAt: toDate(m.startsAt),
    endsAt: toDateOrNull(m.endsAt),
    claimedAt: toDateOrNull(m.claimedAt),
    createdAt: toDate(m.createdAt),
  };
}
