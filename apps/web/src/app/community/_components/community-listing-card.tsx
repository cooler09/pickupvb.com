import Link from 'next/link';
import {
  SURFACE_LABEL,
  FORMAT_LABEL,
  SKILL_LABEL,
  TYPE_LABEL,
  GENDER_LABEL,
} from '@/lib/enum-labels';
import { LocalDateTime } from '@/components/local-datetime';

export type CommunityListingCardData = {
  slug: string;
  title: string;
  externalHostName: string | null;
  startsAt: Date | string;
  /** True when only the date is known — render the date without a time. */
  allDay?: boolean;
  /** IANA timezone for the venue. */
  timeZone?: string | null;
  city: string | null;
  region: string | null;
  surface: string | null;
  format: string | null;
  skillLevel: string | null;
  /** Event kind + gender, mirrored from the events model. Null = unknown. */
  eventType?: string | null;
  gender?: string | null;
  status: string;
  /** Distance from the search origin in km, when a "near me" search is active. */
  distanceKm?: number | null;
};

/**
 * Presentational tile for a community-submitted listing. Links to the
 * internal detail page (not the external URL) — the outbound link is on the
 * detail page so we can show context first.
 */
export function CommunityListingCard({ listing }: { listing: CommunityListingCardData }) {
  const startsAtIso =
    listing.startsAt instanceof Date ? listing.startsAt.toISOString() : listing.startsAt;
  const place = [listing.city, listing.region].filter(Boolean).join(', ');

  return (
    <li className="border-border-base bg-md-surface-container hover:border-primary/40 rounded-shape-sm border p-4">
      <Link href={`/community/${listing.slug}`} className="hover:text-primary block font-semibold">
        {listing.title}
      </Link>
      <p className="text-muted mt-1 text-xs">
        <LocalDateTime
          iso={startsAtIso}
          variant={listing.allDay ? 'eventDay' : 'eventStart'}
          {...(listing.timeZone !== undefined ? { timeZone: listing.timeZone } : {})}
        />
        {listing.allDay && <span className="text-fg/50"> · time TBD</span>}
      </p>
      {place && <p className="text-fg/80 mt-1 text-sm">{place}</p>}
      {typeof listing.distanceKm === 'number' && (
        <p className="text-muted mt-0.5 text-xs">{listing.distanceKm.toFixed(1)} km away</p>
      )}
      <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
        {listing.status === 'hidden' && (
          <span className="bg-md-error/15 text-md-error rounded px-1.5 py-0.5">
            Hidden — only you
          </span>
        )}
        <span className="bg-md-warning/15 text-md-warning rounded px-1.5 py-0.5">Community</span>
        {listing.eventType && (
          <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 font-medium">
            {TYPE_LABEL[listing.eventType] ?? listing.eventType}
          </span>
        )}
        {listing.gender && (
          <span className="bg-fg/5 rounded px-1.5 py-0.5">
            {GENDER_LABEL[listing.gender] ?? listing.gender}
          </span>
        )}
        {listing.surface && (
          <span className="bg-fg/5 rounded px-1.5 py-0.5">
            {SURFACE_LABEL[listing.surface] ?? listing.surface}
          </span>
        )}
        {listing.format && (
          <span className="bg-fg/5 rounded px-1.5 py-0.5">
            {FORMAT_LABEL[listing.format] ?? listing.format}
          </span>
        )}
        {listing.skillLevel && (
          <span className="bg-fg/5 rounded px-1.5 py-0.5">
            {SKILL_LABEL[listing.skillLevel] ?? listing.skillLevel}
          </span>
        )}
      </div>
      {listing.externalHostName && (
        <p className="text-muted mt-2 text-xs">via {listing.externalHostName}</p>
      )}
    </li>
  );
}
