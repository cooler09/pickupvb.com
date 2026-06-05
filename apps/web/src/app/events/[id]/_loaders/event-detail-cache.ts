/**
 * Cached, viewer-independent side-loads for the `/events/[id]` read path
 * (architecture audit P2-6 — consolidation).
 *
 * The event-detail read model + a handful of side-loads (pricing, primary host
 * socials, tip total, ad-hoc team registrations, hero image, sponsor) are
 * identical for every visitor. The infrastructure repository runs on the admin
 * client so RLS doesn't vary by caller — safe to share results across requests.
 *
 * Each is wrapped in `unstable_cache` keyed on the event id with a 60s
 * revalidate window (matches the ISR cadence on sibling detail pages). For
 * anonymous viewers the entire detail page can be served without a single
 * Supabase round-trip on a warm cache. Mutating actions evict via
 * `updateTag(eventCacheTag(id))` (the tag contract lives in `@/lib/cache-tags`).
 *
 * **Why this lives in the web layer, not `@pickupvb/application` (per the
 * audit's P2-6 Fix text):** `unstable_cache` is a `next/cache` primitive, and
 * the application layer is framework-free by the purity ratchet — Next caching
 * cannot move inward. So the consolidation keeps all caching here, in one
 * module, with the read-model composition delegated to `GetEventDetailHandler`.
 *
 * **Never call `cookies()` inside these callbacks** (Next 16 forbids it inside
 * `unstable_cache`). Each cached read resolves the admin client via a dynamic
 * `import()`; the data is viewer-independent, so the service-role read is safe.
 */
import { unstable_cache } from 'next/cache';
import { GetEventDetailQuery } from '@pickupvb/application';
import type { EventDetailReadModel, EventMediaSummary } from '@pickupvb/domain';
import { SupabaseProfileRepository, SupabaseMediaPostRepository } from '@pickupvb/infrastructure';
import { handlers } from '@/lib/handlers';
import { getEventPricing, type EventPricing } from '@/lib/event-pricing';
import type { SocialHandles } from '@/lib/social-handles';
import { eventCacheTag, hostStripeCacheTag, profileCacheTag } from '@/lib/cache-tags';

export type EventSponsorView = {
  name: string;
  blurb: string | null;
  linkUrl: string | null;
  logoUrl: string | null;
  discountCode: string | null;
};

/**
 * Cached event-detail read model with `viewerId = null` — i.e. the public,
 * anonymous view. Used directly for anonymous viewers and from
 * `generateMetadata`. Throws `NotFoundError` if the event doesn't exist.
 *
 * `unstable_cache` JSON-serializes its return value, so every `Date` in the
 * read model comes back as an ISO string on a cache hit (and even on the first
 * miss — Next re-parses the JSON it just wrote). We revive the known date
 * fields before handing the model to callers, otherwise the page crashes with
 * `startsAt.getTime is not a function` for logged-out viewers (logged-in
 * viewers skip this cache entirely and keep native `Date` objects, which is why
 * the bug was anonymous-only). The revival is inherent to caching a `Date`-
 * bearing model through `unstable_cache`; it's co-located here with the only
 * cache that needs it.
 */
export async function loadEventReadModelPublic(id: string): Promise<EventDetailReadModel> {
  const cached = await unstable_cache(
    async () => handlers.getEventDetail.execute(new GetEventDetailQuery(id, null)),
    ['event-detail-public', id],
    { revalidate: 60, tags: [eventCacheTag(id)] },
  )();
  return reviveEventDetailDates(cached);
}

/** Re-hydrate every `Date` field that `unstable_cache` flattened to a string. */
function reviveEventDetailDates(m: EventDetailReadModel): EventDetailReadModel {
  const toDate = (v: unknown): Date => new Date(v as string);
  const toDateOrNull = (v: unknown): Date | null => (v == null ? null : new Date(v as string));
  return {
    ...m,
    startsAt: toDate(m.startsAt),
    endsAt: toDate(m.endsAt),
    registrationClosesAt: toDateOrNull(m.registrationClosesAt),
    attendees: m.attendees.map((a) => ({ ...a, joinedAt: toDate(a.joinedAt) })),
    freeAgents: m.freeAgents.map((f) => ({ ...f, joinedAt: toDate(f.joinedAt) })),
    divisions: m.divisions.map((d) => ({
      ...d,
      startsAt: toDateOrNull(d.startsAt),
      endsAt: toDateOrNull(d.endsAt),
      winner: d.winner ? { ...d.winner, recordedAt: toDate(d.winner.recordedAt) } : null,
    })),
  };
}

export function loadEventPricingCached(id: string): Promise<EventPricing | null> {
  return unstable_cache(async () => getEventPricing(id), ['event-pricing', id], {
    revalidate: 60,
    tags: [eventCacheTag(id)],
  })();
}

export function loadEventTipTotalCached(id: string): Promise<number> {
  return unstable_cache(
    async () => {
      const { getAdminSupabase } = await import('@/lib/supabase-admin');
      const { data } = await getAdminSupabase().rpc('event_tip_total_cents', {
        p_event_id: id,
      } as never);
      return Number(data ?? 0);
    },
    ['event-tip-total', id],
    { revalidate: 60, tags: [eventCacheTag(id)] },
  )();
}

export function loadPrimaryHostSocialCached(hostUserId: string): Promise<SocialHandles | null> {
  return unstable_cache(
    async () => {
      // Admin client via dynamic import — never call cookies() inside
      // unstable_cache. The host's public social links are viewer-independent
      // (read from `profiles_public`), so the service-role read is safe here.
      const { getAdminSupabase } = await import('@/lib/supabase-admin');
      return new SupabaseProfileRepository(getAdminSupabase()).findSocialLinksById(hostUserId);
    },
    ['profile-social', hostUserId],
    { revalidate: 300, tags: [profileCacheTag(hostUserId)] },
  )();
}

/**
 * "Does the primary host have a Stripe account that can accept charges right
 * now?" — cached per-host with a 5-minute window. The host-stripe-account row
 * only flips on webhook callbacks from Stripe, so the lag is acceptable.
 */
export function loadHostStripeReadyCached(hostUserId: string): Promise<boolean> {
  return unstable_cache(
    async () => {
      const { getHostStripeAccount } = await import('@/lib/host-stripe-account');
      return (await getHostStripeAccount(hostUserId)) !== null;
    },
    ['host-can-collect', hostUserId],
    { revalidate: 300, tags: [hostStripeCacheTag(hostUserId)] },
  )();
}

export type AdHocMemberRow = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  email: string | null;
  sort_order: number;
};

export type AdHocRegRow = {
  id: string;
  name: string;
  division_id: string;
  captain_id: string | null;
  source: 'ad_hoc' | 'walk_in';
  captain_display_name: string | null;
  captain_phone: string | null;
  payment_status: 'none' | 'pending' | 'paid' | 'refunded';
  payment_intent_id: string | null;
  amount_paid_cents: number | null;
  payment_note: string | null;
  captain: { id: string; display_name: string | null } | null;
  members: AdHocMemberRow[] | null;
};

// Public-projection types — no email, no user_id.
export type AdHocMemberPublicRow = {
  id: string;
  entry_id: string;
  display_name: string | null;
  sort_order: number;
};

export type AdHocRegPublicRow = {
  id: string;
  name: string;
  division_id: string;
  captain_id: string | null;
  source: 'ad_hoc' | 'walk_in';
  payment_status: 'none' | 'pending' | 'paid' | 'refunded';
  captainDisplayName: string | null;
  members: AdHocMemberPublicRow[];
};

/**
 * Public cached snapshot — reads only from narrow public surfaces so no PII
 * (email, user_id) enters the shared cache.
 *
 * - Registrations from `event_team_entries` (RLS: `using (true)`)
 * - Members from `event_team_entry_members_public` view
 * - Captain names from `profiles_public` (via `ProfileQueries.findCardsByIds`)
 *
 * Used exclusively to build `allRegistrations` (the public-visible list).
 * The full `email` / `user_id` payload for authorized callers comes from
 * `loadAdHocRowsCached`.
 */
export function loadAdHocPublicRowsCached(eventId: string): Promise<AdHocRegPublicRow[]> {
  return unstable_cache(
    async () => {
      const { getAdminSupabase } = await import('@/lib/supabase-admin');
      const admin = getAdminSupabase();

      const { data: regData } = await admin
        .from('event_team_entries')
        .select(
          'id, display_name, division_id, captain_id, source, event_divisions!event_team_entries_division_id_fkey!inner(event_id), payment:event_team_payments(payment_status)',
        )
        .eq('event_divisions.event_id', eventId)
        .neq('source', 'roster')
        .is('deleted_at', null);
      type RegBase = {
        id: string;
        display_name: string;
        division_id: string;
        captain_id: string | null;
        source: 'ad_hoc' | 'walk_in';
        payment:
          | { payment_status: 'none' | 'pending' | 'paid' | 'refunded' }
          | Array<{ payment_status: 'none' | 'pending' | 'paid' | 'refunded' }>
          | null;
      };
      const rawRegs = (regData as RegBase[] | null) ?? [];
      const regs = rawRegs.map((r) => {
        const p = Array.isArray(r.payment) ? r.payment[0] : r.payment;
        return {
          id: r.id,
          display_name: r.display_name,
          division_id: r.division_id,
          captain_id: r.captain_id,
          source: r.source,
          payment_status: (p?.payment_status ?? 'none') as 'none' | 'pending' | 'paid' | 'refunded',
        };
      });
      if (regs.length === 0) return [];

      const regIds = regs.map((r) => r.id);
      const captainIds = [
        ...new Set(regs.map((r) => r.captain_id).filter((id): id is string => !!id)),
      ];

      const [{ data: memberData }, captainCards] = await Promise.all([
        admin
          .from('event_team_entry_members_public')
          .select('id, entry_id, display_name, sort_order')
          .in('entry_id', regIds),
        // Captain display names via the ProfileQueries port (admin client —
        // safe inside unstable_cache, no cookies).
        new SupabaseProfileRepository(admin).findCardsByIds(captainIds),
      ]);

      const membersByReg = new Map<string, AdHocMemberPublicRow[]>();
      for (const m of (memberData as AdHocMemberPublicRow[] | null) ?? []) {
        const arr = membersByReg.get(m.entry_id) ?? [];
        arr.push(m);
        membersByReg.set(m.entry_id, arr);
      }

      return regs.map((r) => ({
        id: r.id,
        name: r.display_name,
        division_id: r.division_id,
        captain_id: r.captain_id,
        source: r.source,
        payment_status: r.payment_status,
        // Walk-ins (captain_id = null) carry their captain's name on the
        // entry's display_name; for ad-hoc, fall back to the linked profile.
        captainDisplayName:
          r.captain_id === null
            ? r.display_name
            : (captainCards.get(r.captain_id)?.displayName ?? null),
        members: (membersByReg.get(r.id) ?? []).sort((a, b) => a.sort_order - b.sort_order),
      }));
    },
    ['event-ad-hoc-public-rows', eventId],
    { revalidate: 60, tags: [eventCacheTag(eventId)] },
  )();
}

/**
 * Private cached snapshot — includes `email` and `user_id` for each member.
 * Only fetched when the viewer is signed in (captain) or is managing the event
 * (host). Never used for the public `allRegistrations` projection.
 */
export function loadAdHocRowsCached(eventId: string): Promise<AdHocRegRow[]> {
  // Viewer-independent; admin client bypasses RLS and is safe inside
  // unstable_cache (no cookies() lookup).
  return unstable_cache(
    async () => {
      const { getAdminSupabase } = await import('@/lib/supabase-admin');
      const { data } = await getAdminSupabase()
        .from('event_team_entries')
        .select(
          'id, display_name, division_id, captain_id, source, captain_display_name, captain_phone, captain:profiles!event_team_entries_captain_id_fkey(id, display_name), members:event_team_entry_members(id, user_id, display_name, email, sort_order), payment:event_team_payments(payment_status, payment_intent_id, amount_paid_cents, payment_note), event_divisions!event_team_entries_division_id_fkey!inner(event_id)',
        )
        .eq('event_divisions.event_id', eventId)
        .neq('source', 'roster')
        .is('deleted_at', null);
      type PaymentEmbed = {
        payment_status: 'none' | 'pending' | 'paid' | 'refunded';
        payment_intent_id: string | null;
        amount_paid_cents: number | null;
        payment_note: string | null;
      };
      type Raw = {
        id: string;
        display_name: string;
        division_id: string;
        captain_id: string | null;
        source: 'ad_hoc' | 'walk_in';
        captain_display_name: string | null;
        captain_phone: string | null;
        captain: { id: string; display_name: string | null } | null;
        members: AdHocMemberRow[] | null;
        payment: PaymentEmbed | PaymentEmbed[] | null;
      };
      const raw = (data as Raw[] | null) ?? [];
      return raw.map((r) => {
        const p = Array.isArray(r.payment) ? r.payment[0] : r.payment;
        return {
          id: r.id,
          name: r.display_name,
          division_id: r.division_id,
          captain_id: r.captain_id,
          source: r.source,
          captain_display_name: r.captain_display_name,
          captain_phone: r.captain_phone,
          payment_status: p?.payment_status ?? 'none',
          payment_intent_id: p?.payment_intent_id ?? null,
          amount_paid_cents: p?.amount_paid_cents ?? null,
          payment_note: p?.payment_note ?? null,
          captain: r.captain,
          members: r.members,
        };
      });
    },
    ['event-ad-hoc-rows', eventId],
    { revalidate: 60, tags: [eventCacheTag(eventId)] },
  )();
}

export function loadHeroImageCached(eventId: string): Promise<string | null> {
  return unstable_cache(
    async () => {
      const { getAdminSupabase } = await import('@/lib/supabase-admin');
      const { data } = await getAdminSupabase()
        .from('events')
        .select('hero_image_url')
        .eq('id', eventId)
        .maybeSingle();
      return (data as { hero_image_url: string | null } | null)?.hero_image_url ?? null;
    },
    ['event-hero-image', eventId],
    { revalidate: 60, tags: [eventCacheTag(eventId)] },
  )();
}

/**
 * Cheap, viewer-independent media summary for the event detail page footprint:
 * the active video/clip count, the live-stream count, and the host-featured
 * live stream (if any). Drives the hero "Live now" pill + the bottom "Videos &
 * clips (N)" link. All browsing happens on `/events/[id]/media`; this keeps the
 * detail page itself to one conditional pill + one link for details-only
 * viewers. No `Date` fields, so no revival needed.
 */
export function loadEventMediaSummaryCached(eventId: string): Promise<EventMediaSummary> {
  return unstable_cache(
    async () => {
      // Admin client via dynamic import — never call cookies() inside
      // unstable_cache. The counts are active-only and viewer-independent.
      const { getAdminSupabase } = await import('@/lib/supabase-admin');
      return new SupabaseMediaPostRepository(getAdminSupabase()).getEventMediaSummary(eventId);
    },
    ['event-media-summary', eventId],
    { revalidate: 60, tags: [eventCacheTag(eventId)] },
  )();
}

export function loadEventSponsorCached(eventId: string): Promise<EventSponsorView | null> {
  return unstable_cache(
    async () => {
      const { getAdminSupabase } = await import('@/lib/supabase-admin');
      const { data } = await getAdminSupabase()
        .from('event_sponsors')
        .select('name, blurb, link_url, logo_url, discount_code')
        .eq('event_id', eventId)
        .maybeSingle();

      if (!data) return null;
      return {
        name: data.name,
        blurb: data.blurb,
        linkUrl: data.link_url,
        logoUrl: data.logo_url,
        discountCode: data.discount_code,
      };
    },
    ['event-sponsor', eventId],
    { revalidate: 60, tags: [eventCacheTag(eventId)] },
  )();
}

export type EventBadgeView = {
  id: string;
  label: string;
  description: string | null;
  iconUrl: string | null;
  grantRule: string;
};

/**
 * Host-authored collectible badges for the event (gamification Phase 2),
 * viewer-independent so it stays on the ISR-cached event page. Drives the
 * "Badges you can earn here" teaser. Evicted by `eventCacheTag(id)` when a host
 * adds/removes a badge.
 */
export function loadEventBadgesCached(eventId: string): Promise<EventBadgeView[]> {
  return unstable_cache(
    async () => {
      const { getAdminSupabase } = await import('@/lib/supabase-admin');
      const { data } = await getAdminSupabase()
        .from('event_badges')
        .select('id, label, description, icon_url, grant_rule')
        .eq('event_id', eventId)
        .order('sort_order', { ascending: true });
      return (
        (data as
          | {
              id: string;
              label: string;
              description: string | null;
              icon_url: string | null;
              grant_rule: string;
            }[]
          | null) ?? []
      ).map((b) => ({
        id: b.id,
        label: b.label,
        description: b.description,
        iconUrl: b.icon_url,
        grantRule: b.grant_rule,
      }));
    },
    ['event-badges', eventId],
    { revalidate: 60, tags: [eventCacheTag(eventId)] },
  )();
}
