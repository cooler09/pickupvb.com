import Link from 'next/link';
import { SURFACE_LABEL, TYPE_LABEL, SKILL_LABEL } from '@/lib/enum-labels';
import { formatEventStart } from '@/lib/date-formats';

export type EventCardData = {
    id: string;
    title: string;
    surface: string;
    skillLevel: string;
    type: string;
    startsAt: Date | string;
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
function followingLabel(
    event: EventCardData,
    friendNameById: Map<string, string>,
): string | null {
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
    const startsAt =
        event.startsAt instanceof Date ? event.startsAt : new Date(event.startsAt);
    const label = friendNameById ? followingLabel(event, friendNameById) : null;

    return (
        <li className="rounded-lg border border-border-base bg-surface p-4 hover:border-primary/40">
            <Link href={`/events/${event.id}`} className="block font-semibold hover:text-primary">
                {event.title}
            </Link>
            <p className="mt-1 text-xs text-muted">{formatEventStart(startsAt)}</p>
            <p className="mt-1 text-sm text-fg/80">
                {event.city}, {event.region}
                {event.distanceKm !== null && (
                    <span className="text-muted"> · {event.distanceKm.toFixed(1)} km</span>
                )}
            </p>
            <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                <span className="rounded bg-primary/15 px-1.5 py-0.5 text-primary">
                    {TYPE_LABEL[event.type] ?? event.type}
                </span>
                <span className="rounded bg-fg/5 px-1.5 py-0.5">
                    {SURFACE_LABEL[event.surface] ?? event.surface}
                </span>
                <span className="rounded bg-fg/5 px-1.5 py-0.5">
                    {SKILL_LABEL[event.skillLevel] ?? event.skillLevel}
                </span>
            </div>
            {label && (
                <p className="mt-2 text-[11px] font-medium text-primary">{label}</p>
            )}
            {event.spotsRemaining !== null && (
                <p className="mt-2 text-xs text-muted">{event.spotsRemaining} spots open</p>
            )}
        </li>
    );
}
