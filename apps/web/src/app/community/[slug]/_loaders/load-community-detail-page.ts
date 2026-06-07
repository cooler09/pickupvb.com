import { GetCommunityListingDetailQuery } from '@pickupvb/application';
import { NotFoundError, type CommunityListingDetailReadModel } from '@pickupvb/domain';
import { SupabaseProfileRepository } from '@pickupvb/infrastructure';
import { handlers } from '@/lib/handlers';
import { getServerSupabase } from '@/lib/supabase';
import { loadVisibleHostedEvents } from '@/components/hosted-events-list';

export type HostedEvent = Awaited<ReturnType<typeof loadVisibleHostedEvents>>[number];

export type PendingClaim = {
  eventId: string;
  eventTitle: string | null;
  eventSlug: string | null;
  claimantId: string;
  claimantName: string;
};

/** The viewer-conditional chrome a community-listing detail page renders, all
 *  assembled in one place. Fetched client-side via the `getCommunityViewerChrome`
 *  server action so the page shell itself stays cookie-free and ISR-cacheable
 *  (performance audit P2 #16). `null` means the viewer can't see the listing. */
export type CommunityViewerChromeModel = {
  /** Viewer-scoped read (canManage / isPlatformAdmin / hasReported / reportCount). */
  detail: CommunityListingDetailReadModel;
  pendingClaim: PendingClaim | null;
  viewerIsClaimant: boolean;
  showHiddenWarning: boolean;
  showClaimSection: boolean;
  /** Hosted events on the same day + city as the listing (claim dropdown). */
  eligibleEvents: HostedEvent[];
  /** All of the viewer's upcoming hosted events (drives the empty-state copy). */
  claimableEvents: HostedEvent[];
};

async function loadDetail(
  slug: string,
  viewerId: string,
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

/**
 * Viewer-scoped chrome for a community listing. Runs in the
 * `getCommunityViewerChrome` server action (cookies available), so it may read
 * the viewer-aware detail + the viewer's hosted events. Returns `null` when the
 * listing isn't visible to this viewer (e.g. a non-manager hitting a hidden /
 * removed listing) so the client renders a generic "not available" state.
 */
export async function loadCommunityViewerChrome(
  slug: string,
  user: { id: string },
): Promise<CommunityViewerChromeModel | null> {
  const detail = await loadDetail(slug, user.id);
  if (!detail) return null;

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

  const viewerIsClaimant = detail.status === 'claim_pending' && user.id === detail.claimedByUserId;

  // For the claim section: surface the viewer's upcoming hosted events so they
  // can pick one from a dropdown instead of pasting a UUID. Only load when the
  // section will actually render (active listing, not already manageable).
  const showClaimSection = detail.status === 'active' && !detail.canManage;
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
    pendingClaim,
    viewerIsClaimant,
    showHiddenWarning,
    showClaimSection,
    eligibleEvents,
    claimableEvents,
  };
}
