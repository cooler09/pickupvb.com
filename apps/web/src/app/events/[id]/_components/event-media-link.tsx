import Link from 'next/link';
import type { Route } from 'next';

/**
 * Compact, single-row entry point to the event's media sub-page. This is the
 * *only* persistent video footprint on the event detail page (the hero adds a
 * conditional "Live now" pill) — all browsing / posting lives at
 * `/events/[id]/media`, so details-only viewers see just this one line.
 */
export function EventMediaLink({
  eventId,
  totalCount,
  liveCount,
}: {
  eventId: string;
  totalCount: number;
  liveCount: number;
}) {
  return (
    <Link
      href={`/events/${eventId}/media` as Route}
      className="border-border-base hover:bg-fg/5 rounded-shape-sm flex items-center justify-between gap-3 border p-4"
    >
      <div>
        <h2 className="text-fg text-base font-semibold">
          🎬 Videos &amp; clips
          {totalCount > 0 && <span className="text-muted font-normal"> ({totalCount})</span>}
        </h2>
        <p className="text-muted text-xs">
          {liveCount > 0 && (
            <span className="text-md-error font-medium">🔴 {liveCount} live now · </span>
          )}
          {totalCount > 0
            ? 'Streams, match videos, and highlights.'
            : 'Be the first to post a stream, video, or clip.'}
        </p>
      </div>
      <span className="text-primary shrink-0 text-sm font-medium">
        {totalCount > 0 ? 'View' : 'Add'} →
      </span>
    </Link>
  );
}
