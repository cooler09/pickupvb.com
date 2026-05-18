import Link from 'next/link';
import { SURFACE_LABEL, FORMAT_LABEL, SKILL_LABEL } from '@/lib/enum-labels';
import { LocalDateTime } from '@/components/local-datetime';

export type CommunityListingCardData = {
  slug: string;
  title: string;
  externalHostName: string | null;
  startsAt: Date | string;
  /** IANA timezone for the venue. */
  timeZone?: string | null;
  city: string | null;
  region: string | null;
  surface: string | null;
  format: string | null;
  skillLevel: string | null;
  status: string;
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
    <li className="border-border-base bg-surface hover:border-primary/40 rounded-lg border p-4">
      <Link href={`/community/${listing.slug}`} className="hover:text-primary block font-semibold">
        {listing.title}
      </Link>
      <p className="text-muted mt-1 text-xs">
        <LocalDateTime
          iso={startsAtIso}
          variant="eventStart"
          {...(listing.timeZone !== undefined ? { timeZone: listing.timeZone } : {})}
        />
      </p>
      {place && <p className="text-fg/80 mt-1 text-sm">{place}</p>}
      <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
          Community
        </span>
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
