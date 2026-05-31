import type { MediaPostItem } from '@pickupvb/domain';
import { VideoEmbed } from '@/components/video-embed';

/**
 * Read-only grid of a player's videos for their public profile. No moderation
 * controls — the owner manages their posts from the /profile dashboard, and
 * each event's media sub-page carries the report/remove affordances.
 */
export function ProfileVideoGrid({ items }: { items: MediaPostItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.id} className="border-border-base rounded-shape-sm space-y-2 border p-3">
          <VideoEmbed
            provider={item.provider}
            externalId={item.externalId}
            subtype={item.subtype}
            videoUrl={item.videoUrl}
            title={item.title}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {item.isLive && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                <span aria-hidden="true">🔴</span> Live
              </span>
            )}
          </div>
          <h3 className="text-fg text-sm font-medium">{item.title}</h3>
        </div>
      ))}
    </div>
  );
}
