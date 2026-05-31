/**
 * Centralized cache-tag builders (architecture audit P2-6).
 *
 * A tag string is the contract between an `unstable_cache` **cache site** (the
 * event-detail side-loads in `events/[id]/_loaders/event-detail-cache.ts`) and
 * every mutating action's **eviction site** (`updateTag(...)`). The `event:`
 * tag alone is referenced by ~10 callers; keeping it a single exported function
 * stops the magic string from drifting — a typo on either side silently breaks
 * read-your-own-writes without any error.
 *
 * Per AGENTS.md: pair `updateTag(eventCacheTag(id))` with
 * `revalidatePath(returnPath)` in mutating server actions. `revalidatePath`
 * busts the page render cache; `updateTag` evicts the tagged `unstable_cache`
 * entries (the two are separate caches in Next 16).
 */
export const eventCacheTag = (eventId: string): string => `event:${eventId}`;
export const profileCacheTag = (userId: string): string => `profile:${userId}`;
export const hostStripeCacheTag = (userId: string): string => `host-stripe:${userId}`;
