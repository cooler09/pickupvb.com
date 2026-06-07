import Link from 'next/link';
import type { CommunityListingSummary } from '@pickupvb/domain';
import { CommunityListingCard } from '@/app/community/_components/community-listing-card';

/** "From the community" rail on the events list — non-PickupVB events players
 *  posted. Renders nothing when empty. Extracted from events/page.tsx (P3-1). */
export function CommunityRail({ listings }: { listings: ReadonlyArray<CommunityListingSummary> }) {
  if (listings.length === 0) return null;
  return (
    <section className="border-border-base space-y-3 border-t pt-6">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h2 className="text-title-lg font-semibold">From the community</h2>
          <p className="text-muted text-sm">
            Events posted by players that aren&rsquo;t hosted on PickupVB. RSVP at the linked
            source.
          </p>
        </div>
        <Link href="/community" className="text-primary text-sm whitespace-nowrap hover:underline">
          See all
        </Link>
      </div>
      <ul className="stagger-in grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {listings.map((listing) => (
          <CommunityListingCard
            key={listing.id}
            listing={{
              slug: listing.slug,
              title: listing.title,
              externalHostName: listing.externalHostName,
              startsAt: listing.startsAt,
              timeZone: listing.timeZone,
              city: listing.city,
              region: listing.region,
              surface: listing.surface,
              format: listing.format,
              skillLevel: listing.skillLevel,
              status: listing.status,
            }}
          />
        ))}
      </ul>
    </section>
  );
}
