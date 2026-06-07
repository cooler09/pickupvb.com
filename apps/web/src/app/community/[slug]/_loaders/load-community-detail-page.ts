import { notFound, permanentRedirect } from 'next/navigation';
import { GetCommunityListingDetailQuery } from '@pickupvb/application';
import { NotFoundError, type CommunityListingDetailReadModel } from '@pickupvb/domain';
import { SupabaseProfileRepository } from '@pickupvb/infrastructure';
import { handlers } from '@/lib/handlers';
import { getServerSupabase } from '@/lib/supabase';
import { loadVisibleHostedEvents } from '@/components/hosted-events-list';
import { loadCommunityDetailPublic } from '../community-detail-cache';

export type HostedEvent = Awaited<ReturnType<typeof loadVisibleHostedEvents>>[number];

export type PendingClaim = {
  eventId: string;
  eventTitle: string | null;
  eventSlug: string | null;
  claimantId: string;
  claimantName: string;
};

/** Everything the community-listing detail page needs to render, assembled in
 *  one place (architecture audit P3-1 — data orchestration out of the page). */
export type CommunityDetailPageModel = {
  detail: CommunityListingDetailReadModel;
  isIndexable: boolean;
  notice: string | undefined;
  place: string | null;
  hostLabel: string;
  showHiddenWarning: boolean;
  pendingClaim: PendingClaim | null;
  viewerIsClaimant: boolean;
  showClaimSection: boolean;
  /** Hosted events on the same day + city as the listing (claim dropdown). */
  eligibleEvents: HostedEvent[];
  /** All of the viewer's upcoming hosted events (drives the empty-state copy). */
  claimableEvents: HostedEvent[];
};

async function loadDetail(
  slug: string,
  viewerId: string | null,
): Promise<CommunityListingDetailReadModel | null> {
  try {
    return await handlers.getCommunityListingDetail.execute(
      new GetCommunityListingDetailQuery(slug, viewerId),
    );
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}

function externalHostFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Format a `Date` as `YYYY-MM-DD` in the given IANA timezone, for "same
 * calendar day" comparisons. Falls back to UTC if the runtime rejects the
 * zone. Mirrors the application-layer helper used by
 * `ClaimCommunityListingHandler`.
 */
function formatDayKey(d: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export async function loadCommunityDetailPage(
  slug: string,
  searchParams: Record<string, string | string[] | undefined>,
  user: { id: string } | null,
): Promise<CommunityDetailPageModel> {
  // Anonymous viewers (and crawlers) read the shared 60s-cached public model;
  // logged-in viewers get a fresh viewer-scoped read (canManage / hasReported /
  // own-hidden). See community-detail-cache.ts (audit CL-12).
  const detail = user ? await loadDetail(slug, user.id) : await loadCommunityDetailPublic(slug);
  if (!detail) notFound();

  // A claimed listing exists only to funnel visitors to the on-platform event
  // it was linked to (the whole point of the claim flow). Permanently redirect
  // to that event so old listing URLs — and any search-indexed copies — land on
  // the event page instead of a dead-end community page still pointing at the
  // external site. The FK is `on delete set null`, so a non-null
  // `claimedEventId` here means the event still exists; resolve its slug (fall
  // back to the id, which the events route also accepts).
  if (detail.status === 'claimed' && detail.claimedEventId) {
    const sb = await getServerSupabase();
    const { data: ev } = await sb
      .from('events')
      .select('slug')
      .eq('id', detail.claimedEventId)
      .maybeSingle();
    const target = (ev as { slug?: string | null } | null)?.slug ?? detail.claimedEventId;
    permanentRedirect(`/events/${target}`);
  }

  // Only emit structured data on the indexable statuses (matches the
  // `generateMetadata` noindex guard) so hidden/removed/claimed listings don't
  // advertise rich-result signals.
  const isIndexable = detail.status === 'active' || detail.status === 'claim_pending';

  const notice = Array.isArray(searchParams['notice'])
    ? searchParams['notice'][0]
    : searchParams['notice'];

  const place = detail.location
    ? [
        detail.location.addressLine,
        detail.location.city,
        detail.location.region,
        detail.location.postalCode,
      ]
        .filter(Boolean)
        .join(', ')
    : null;
  const hostLabel = detail.externalHostName ?? externalHostFromUrl(detail.externalUrl);

  const showHiddenWarning =
    (detail.status === 'hidden' || detail.status === 'removed') && detail.canManage;

  // Pending-claim metadata: when the listing is in `claim_pending`, fetch
  // the proposed event title/slug and the claimant's display name so the
  // submitter/admin can review the request in-place. Single round trip;
  // skipped entirely for any other status.
  let pendingClaim: PendingClaim | null = null;
  if (detail.status === 'claim_pending' && detail.claimedEventId && detail.claimedByUserId) {
    const sb = await getServerSupabase();
    const [evRes, claimantCard] = await Promise.all([
      sb.from('events').select('id, title, slug').eq('id', detail.claimedEventId).maybeSingle(),
      new SupabaseProfileRepository(sb).findCardById(detail.claimedByUserId),
    ]);
    pendingClaim = {
      eventId: detail.claimedEventId,
      eventTitle: (evRes.data as { title?: string } | null)?.title ?? null,
      eventSlug: (evRes.data as { slug?: string | null } | null)?.slug ?? null,
      claimantId: detail.claimedByUserId,
      claimantName: claimantCard?.displayName ?? 'A host',
    };
  }

  const viewerIsClaimant =
    !!user && detail.status === 'claim_pending' && user.id === detail.claimedByUserId;

  // For the claim section: surface the viewer's upcoming hosted events so they
  // can pick one from a dropdown instead of pasting a UUID. Only load when the
  // section will actually render (logged-in, active listing, not already
  // manageable by viewer).
  const showClaimSection = !!user && detail.status === 'active' && !detail.canManage;
  const claimableEvents = showClaimSection
    ? await loadVisibleHostedEvents(await getServerSupabase(), user.id, {
        startsAfter: new Date(),
      })
    : [];

  // Filter to events that actually match this listing's day + city. The
  // application handler enforces the same rule server-side as a security
  // check (preventing a host from claiming arbitrary listings); the UI
  // filter is purely UX so the dropdown isn't full of mismatched options.
  const listingCityNormalized = detail.location?.city?.trim().toLowerCase() ?? null;
  const listingDayKey = listingCityNormalized
    ? formatDayKey(detail.startsAt, detail.timeZone ?? 'UTC')
    : null;
  const eligibleEvents =
    listingCityNormalized && listingDayKey
      ? claimableEvents.filter((e) => {
          if (e.city.trim().toLowerCase() !== listingCityNormalized) return false;
          const eventTz = e.time_zone ?? detail.timeZone ?? 'UTC';
          return formatDayKey(new Date(e.starts_at), eventTz) === listingDayKey;
        })
      : [];

  return {
    detail,
    isIndexable,
    notice,
    place,
    hostLabel,
    showHiddenWarning,
    pendingClaim,
    viewerIsClaimant,
    showClaimSection,
    eligibleEvents,
    claimableEvents,
  };
}
