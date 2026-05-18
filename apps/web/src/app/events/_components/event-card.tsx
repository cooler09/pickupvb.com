import Link from 'next/link';
import { SURFACE_LABEL, TYPE_LABEL, SKILL_LABEL } from '@/lib/enum-labels';
import { LocalDateTime } from '@/components/local-datetime';

export type EventCardData = {
  id: string;
  title: string;
  surface: string;
  skillLevel: string;
  type: string;
  startsAt: Date | string;
  /** IANA timezone for the venue. */
  timeZone?: string | null;
  city: string;
  region: string;
  spotsRemaining: number | null;
  distanceKm: number | null;
  /** Following-tab metadata. */
  hostFriendId?: string;
  attendingFriendIds?: string[];
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

  return (
    <li className="border-border-base bg-surface hover:border-primary/40 rounded-lg border p-4">
      <Link href={`/events/${event.id}`} className="hover:text-primary block font-semibold">
        {event.title}
      </Link>
      <p className="text-muted mt-1 text-xs">
        <LocalDateTime
          iso={startsAtIso}
          variant="eventStart"
          {...(event.timeZone !== undefined ? { timeZone: event.timeZone } : {})}
        />
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
        <span className="bg-fg/5 rounded px-1.5 py-0.5">
          {SURFACE_LABEL[event.surface] ?? event.surface}
        </span>
        <span className="bg-fg/5 rounded px-1.5 py-0.5">
          {SKILL_LABEL[event.skillLevel] ?? event.skillLevel}
        </span>
      </div>
      {label && <p className="text-primary mt-2 text-[11px] font-medium">{label}</p>}
      {event.spotsRemaining !== null && (
        <p className="text-muted mt-2 text-xs">{event.spotsRemaining} spots open</p>
      )}
    </li>
  );
}
