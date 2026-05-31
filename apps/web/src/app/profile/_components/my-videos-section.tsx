import type { MediaPostItem } from '@pickupvb/domain';
import { VideoEmbed } from '@/components/video-embed';
import { AddProfileVideoForm } from './add-profile-video-form';
import { removeProfileMediaFromForm } from '../media-actions';

/**
 * Owner-only video manager on the profile dashboard. Lists the user's posts
 * (active + auto-hidden so they can see moderation state) with a remove control
 * and the "add a video" form. Event-attached posts also appear here — your
 * profile doubles as your highlight reel.
 */
export function MyVideosSection({ items }: { items: MediaPostItem[] }) {
  return (
    <div className="space-y-4">
      <AddProfileVideoForm />

      {items.length > 0 && (
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
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-fg truncate text-sm font-medium">{item.title}</h3>
                {item.status === 'hidden' && (
                  <span className="bg-fg/10 text-muted shrink-0 rounded-full px-2 py-0.5 text-xs">
                    Hidden
                  </span>
                )}
              </div>
              <form action={removeProfileMediaFromForm.bind(null, item.id)}>
                <button
                  type="submit"
                  className="border-border-base hover:bg-fg/5 rounded-md border px-2.5 py-1 text-xs font-medium text-red-600"
                >
                  Remove
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
