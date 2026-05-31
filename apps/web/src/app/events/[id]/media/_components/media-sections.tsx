import type { EventMediaReadModel, MediaPostItem } from '@pickupvb/domain';
import { MediaCard } from './media-card';

function Section({
  title,
  hint,
  items,
  eventId,
  canManageEvent,
  viewerIsRealUser,
}: {
  title: string;
  hint?: string;
  items: MediaPostItem[];
  eventId: string;
  canManageEvent: boolean;
  viewerIsRealUser: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-fg text-lg font-semibold">
          {title} <span className="text-muted font-normal">({items.length})</span>
        </h2>
        {hint && <p className="text-muted text-xs">{hint}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <MediaCard
            key={item.id}
            item={item}
            eventId={eventId}
            canManageEvent={canManageEvent}
            viewerIsRealUser={viewerIsRealUser}
          />
        ))}
      </div>
    </section>
  );
}

export function MediaSections({
  media,
  eventId,
  viewerIsRealUser,
}: {
  media: EventMediaReadModel;
  eventId: string;
  viewerIsRealUser: boolean;
}) {
  const { liveStreams, matchVideos, clips, canManageEvent } = media;
  const total = liveStreams.length + matchVideos.length + clips.length;

  if (total === 0) {
    return (
      <p className="text-muted text-sm">
        No videos yet.{viewerIsRealUser ? ' Post the first stream, video, or clip above.' : ''}
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <Section
        title="Live streams"
        {...(canManageEvent
          ? { hint: 'Feature one stream to highlight it on the event page.' }
          : {})}
        items={liveStreams}
        eventId={eventId}
        canManageEvent={canManageEvent}
        viewerIsRealUser={viewerIsRealUser}
      />
      <Section
        title="Match videos"
        items={matchVideos}
        eventId={eventId}
        canManageEvent={canManageEvent}
        viewerIsRealUser={viewerIsRealUser}
      />
      <Section
        title="Clips & highlights"
        items={clips}
        eventId={eventId}
        canManageEvent={canManageEvent}
        viewerIsRealUser={viewerIsRealUser}
      />
    </div>
  );
}
