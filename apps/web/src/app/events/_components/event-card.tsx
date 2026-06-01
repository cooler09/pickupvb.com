import Link from 'next/link';
import Image from 'next/image';
import {
  SURFACE_LABEL,
  TYPE_LABEL,
  SKILL_LABEL,
  SKILL_TIER_LABEL,
  AGE_GROUP_LABEL,
  FORMAT_LABEL,
  GENDER_LABEL,
} from '@/lib/enum-labels';
import { LocalDateTime } from '@/components/local-datetime';
import { DefaultCourtArt } from '@/components/default-court-art';

export type EventCardDivision = {
  id: string;
  label: string;
  surface?: string;
  format?: string | null;
  gender?: string | null;
  skillTier: string;
  tierLabel: string | null;
  ageGroup: string;
  teamComposition: string;
  priceCents: number | null;
  priceUnit: string;
};

export type EventCardData = {
  id: string;
  title: string;
  surface: string;
  skillLevel: string;
  type: string;
  startsAt: Date | string;
  /** IANA timezone for the venue. */
  timeZone?: string | null;
  /**
   * Server-computed relative day label ("Today" / "Tomorrow" / "Sat") for
   * events within a week; null/absent → show the absolute date. Computed at the
   * page boundary so the card stays a pure server component.
   */
  relativeDay?: string | null;
  city: string;
  region: string;
  /** Public hero image URL for the card thumbnail; null/absent → tinted fallback. */
  heroImageUrl?: string | null;
  spotsRemaining: number | null;
  distanceKm: number | null;
  /**
   * Per-division price cents for the price chip. Set by the Following feed
   * (which doesn't carry full `divisions`); on the search tabs the chip falls
   * back to reading prices off `divisions`. See {@link eventPriceCents}.
   */
  priceCents?: ReadonlyArray<number | null>;
  /** Primary division's price unit (`per_team` shows a "/team" suffix). */
  priceUnit?: string | null;
  /** Following-tab metadata. */
  hostFriendId?: string;
  attendingFriendIds?: string[];
  /** ADR 0006 metadata. */
  seriesName?: string | null;
  seriesPosition?: number | null;
  seriesSize?: number | null;
  isFundraiser?: boolean;
  divisions?: ReadonlyArray<EventCardDivision>;
};

type Props = {
  event: EventCardData;
  /**
   * When provided (Following tab), renders a "Hosted by …" or
   * "X is going" line under the tags.
   */
  friendNameById?: Map<string, string>;
};

/**
 * Build the "why this event surfaced" caption shown on the Following feed.
 * Returns null when there's nothing meaningful to say (no friend hosting,
 * no friends attending) — falls back to the standard card without a label.
 */
function followingLabel(event: EventCardData, friendNameById: Map<string, string>): string | null {
  const hostName = event.hostFriendId ? friendNameById.get(event.hostFriendId) : undefined;
  if (hostName) return `Hosted by ${hostName}`;

  const goingNames = (event.attendingFriendIds ?? [])
    .map((id) => friendNameById.get(id))
    .filter((n): n is string => Boolean(n));
  if (goingNames.length === 0) return null;
  if (goingNames.length === 1) return `${goingNames[0]} is going`;
  if (goingNames.length === 2) return `${goingNames[0]} and ${goingNames[1]} are going`;
  return `${goingNames[0]} and ${goingNames.length - 1} others going`;
}

/** Spots-remaining count at or below this renders the urgent "N left" badge. */
const LOW_SPOTS_THRESHOLD = 4;

/**
 * Card thumbnail: the event's hero image, or the surface-aware volleyball court
 * ({@link DefaultCourtArt}) when none is set — the same motif the detail-page
 * hero uses, so cards and heroes match. Decorative (`alt=""`) — the title sits
 * directly beneath. Sits in flow under the title's stretched link, so the whole
 * card stays one click target.
 */
function CardThumb({ url, surface }: { url: string | null | undefined; surface: string }) {
  return (
    <div
      className={`relative mb-3 aspect-video overflow-hidden rounded-md ${url ? 'bg-fg/5' : ''}`}
    >
      {url ? (
        <Image
          src={url}
          alt=""
          fill
          sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
          className="object-cover"
        />
      ) : (
        <DefaultCourtArt surface={surface} />
      )}
    </div>
  );
}

/** Format integer cents as USD, dropping the decimals on whole-dollar amounts. */
function formatPriceCents(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/**
 * Per-division price cents for a card, from whichever source the feed
 * populated: the explicit `priceCents` list (Following feed) or the prices on
 * `divisions` (search tabs). The single source of truth for both the price chip
 * and the events page's Free/Paid filter, so the two never disagree.
 */
export function eventPriceCents(event: EventCardData): ReadonlyArray<number | null> {
  return event.priceCents ?? (event.divisions ?? []).map((d) => d.priceCents);
}

/** True when every listed price is free (0 / null). False when the list is empty. */
export function isEventFree(cents: ReadonlyArray<number | null>): boolean {
  return cents.length > 0 && cents.every((c) => (c ?? 0) === 0);
}

/**
 * Build the price chip from a card's per-division price cents plus the primary
 * division's unit. Returns null when there are no prices to show.
 *
 * - all free → "Free"
 * - one uniform price → "$10" (with "/team" when priced per team)
 * - mixed prices → "From $X" (lowest paid division)
 */
function priceLabel(
  cents: ReadonlyArray<number | null>,
  unit: string | null | undefined,
): { text: string; free: boolean } | null {
  if (cents.length === 0) return null;
  if (isEventFree(cents)) return { text: 'Free', free: true };
  const nums = cents.map((c) => c ?? 0);
  const positive = nums.filter((c) => c > 0);
  const min = Math.min(...positive);
  const uniform = positive.length === nums.length && new Set(positive).size === 1;
  if (uniform) {
    return { text: `${formatPriceCents(min)}${unit === 'per_team' ? '/team' : ''}`, free: false };
  }
  return { text: `From ${formatPriceCents(min)}`, free: false };
}

/**
 * Reusable event tile used by the events list, the Following feed, and any
 * future "events for player/group" page. Pure presentational — accepts a
 * normalized `EventCardData` plus an optional friend-name map for the
 * Following caption.
 */
export function EventCard({ event, friendNameById }: Props) {
  const startsAtIso =
    event.startsAt instanceof Date ? event.startsAt.toISOString() : event.startsAt;
  const label = friendNameById ? followingLabel(event, friendNameById) : null;
  const divisions = event.divisions ?? [];
  const seriesLabel =
    event.seriesName && event.seriesPosition && event.seriesSize
      ? `${event.seriesName} · ${event.seriesPosition}/${event.seriesSize}`
      : (event.seriesName ?? null);
  const price = priceLabel(eventPriceCents(event), event.priceUnit ?? divisions[0]?.priceUnit);

  return (
    <li className="card-lift border-border-base bg-surface hover:border-primary/40 focus-within:ring-primary/40 rounded-shape-sm relative border p-4 focus-within:ring-2">
      <CardThumb url={event.heroImageUrl} surface={event.surface} />
      {/* Stretched link makes the whole tile tappable; there are no other
          interactive children, so `focus-within` rings the entire card on
          keyboard focus. */}
      <Link
        href={`/events/${event.id}`}
        className="hover:text-primary block font-semibold after:absolute after:inset-0 focus-visible:outline-none"
      >
        {event.title}
      </Link>
      {seriesLabel && <p className="text-muted mt-0.5 text-[11px]">{seriesLabel}</p>}
      <p className="text-muted mt-1 text-xs">
        {event.relativeDay ? (
          <>
            <span className="text-fg font-medium">{event.relativeDay}</span>
            {' · '}
            <LocalDateTime
              iso={startsAtIso}
              variant="time"
              {...(event.timeZone !== undefined ? { timeZone: event.timeZone } : {})}
            />
          </>
        ) : (
          <LocalDateTime
            iso={startsAtIso}
            variant="eventStart"
            {...(event.timeZone !== undefined ? { timeZone: event.timeZone } : {})}
          />
        )}
      </p>
      <p className="text-fg/80 mt-1 text-sm">
        {event.city}, {event.region}
        {event.distanceKm !== null && (
          <span className="text-muted"> · {event.distanceKm.toFixed(1)} km</span>
        )}
      </p>
      <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
        <span className="bg-primary/15 text-primary rounded px-1.5 py-0.5">
          {TYPE_LABEL[event.type] ?? event.type}
        </span>
        {price && (
          <span
            className={
              price.free
                ? 'rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800'
                : 'bg-fg/5 text-fg rounded px-1.5 py-0.5 font-semibold'
            }
          >
            {price.text}
          </span>
        )}
        {(() => {
          // Surface: show event-level by default, but if divisions disagree
          // (a tournament that mixes indoor + sand) call it out as "varies".
          const divSurfaces = new Set(
            divisions.map((d) => d.surface).filter((s): s is string => Boolean(s)),
          );
          if (divSurfaces.size > 1) {
            return (
              <span className="bg-fg/5 rounded px-1.5 py-0.5">
                {Array.from(divSurfaces)
                  .map((s) => SURFACE_LABEL[s] ?? s)
                  .join(' · ')}
              </span>
            );
          }
          return (
            <span className="bg-fg/5 rounded px-1.5 py-0.5">
              {SURFACE_LABEL[event.surface] ?? event.surface}
            </span>
          );
        })()}
        {divisions.length > 1 ? (
          <span className="bg-fg/5 rounded px-1.5 py-0.5">{divisions.length} divisions</span>
        ) : (
          <span className="bg-fg/5 rounded px-1.5 py-0.5">
            {(() => {
              const primary = divisions[0];
              if (primary) {
                return (
                  primary.tierLabel ?? SKILL_TIER_LABEL[primary.skillTier] ?? primary.skillTier
                );
              }
              return SKILL_LABEL[event.skillLevel] ?? event.skillLevel;
            })()}
          </span>
        )}
        {event.isFundraiser && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">Fundraiser</span>
        )}
        {(() => {
          // Capacity urgency. spots_remaining is populated on every tab —
          // by the search RPC (Upcoming/Past) and the Following-feed repo —
          // from the primary division's fixed capacity; null when open-ended.
          const spots = event.spotsRemaining;
          if (spots === null) return null;
          if (spots <= 0) {
            return <span className="bg-fg/10 text-muted rounded px-1.5 py-0.5">Full</span>;
          }
          if (spots <= LOW_SPOTS_THRESHOLD) {
            return (
              <span className="spots-pulse rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">
                {spots} left
              </span>
            );
          }
          return <span className="bg-fg/5 text-muted rounded px-1.5 py-0.5">{spots} spots</span>;
        })()}
      </div>
      {divisions.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1 text-[11px]">
          {divisions.slice(0, 4).map((d) => {
            const parts: string[] = [];
            parts.push(d.tierLabel ?? SKILL_TIER_LABEL[d.skillTier] ?? d.skillTier);
            // For multi-division (tournaments), include format/gender so users
            // can see what's offered without clicking through. Open-play has
            // a single division and these duplicate the top-row chips.
            if (divisions.length > 1) {
              if (d.format) parts.push(FORMAT_LABEL[d.format] ?? d.format);
              if (d.gender) parts.push(GENDER_LABEL[d.gender] ?? d.gender);
            }
            if (d.ageGroup !== 'adult') {
              parts.push(AGE_GROUP_LABEL[d.ageGroup] ?? d.ageGroup);
            }
            return (
              <li key={d.id} className="bg-fg/5 rounded px-1.5 py-0.5">
                {parts.join(' · ')}
              </li>
            );
          })}
          {divisions.length > 4 && (
            <li className="text-muted px-1.5 py-0.5">+{divisions.length - 4} more</li>
          )}
        </ul>
      )}
      {label && <p className="text-primary mt-2 text-[11px] font-medium">{label}</p>}
    </li>
  );
}
