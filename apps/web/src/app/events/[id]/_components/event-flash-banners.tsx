import Link from 'next/link';
import type { Route } from 'next';
import { Alert } from '@/components/alert';
import { primaryButtonClass } from '@/components/primary-button';

export function EventFlashBanners({
  created,
  tip,
  tipMsg,
  cohost,
  cohostMsg,
  eventId,
  canAddCoverPhoto = false,
}: {
  created: string | undefined;
  tip: string | undefined;
  tipMsg: string | undefined;
  cohost: string | undefined;
  cohostMsg: string | undefined;
  /** Event id, used to deep-link the post-create cover-photo nudge (CE-9). */
  eventId?: string;
  /** Show the "add a cover photo" nudge right after creation — true only when
   *  the viewer can manage the event and it has no hero image yet (CE-9). */
  canAddCoverPhoto?: boolean;
}) {
  return (
    <>
      {created === '1' && canAddCoverPhoto && eventId && (
        <div className="border-md-outline-variant bg-md-surface-container-high rounded-shape-sm flex flex-wrap items-center justify-between gap-3 border p-4">
          <div className="min-w-0">
            <p className="text-fg font-semibold">Add a cover photo</p>
            <p className="text-muted text-sm">
              Events with a photo stand out in the feed and get more sign-ups. Takes a few seconds.
            </p>
          </div>
          <Link
            href={`/events/${eventId}/edit#cover-photo` as Route}
            className={primaryButtonClass('sm')}
          >
            Add photo
          </Link>
        </div>
      )}
      {created === '1' && (
        <Alert variant="success" title="Event created!">
          Share the link above or invite co-hosts so players can find your event.
        </Alert>
      )}
      {tip === 'thanks' && <Alert variant="success">Thanks for tipping the host!</Alert>}
      {tip === 'cancel' && (
        <div className="border-border-base bg-md-surface-container rounded-shape-sm border p-3 text-sm">
          Tip cancelled.
        </div>
      )}
      {tip === 'error' && (
        <div className="border-secondary bg-secondary/10 rounded-shape-sm border p-3 text-sm">
          {tipMsg ?? 'Could not process tip.'}
        </div>
      )}
      {cohost === 'unauthorized' && (
        <Alert variant="error" title="Not allowed">
          Only the primary host can manage co-hosts for this event.
        </Alert>
      )}
      {cohost === 'notfound' && (
        <Alert variant="error" title="Could not update co-hosts">
          We couldn&apos;t find the event, user, or group you selected.
        </Alert>
      )}
      {cohost === 'conflict' && (
        <Alert variant="warning" title="Already a co-host">
          That user or group is already hosting this event.
        </Alert>
      )}
      {cohost === 'invalid' && (
        <Alert variant="error" title="Invalid co-host request">
          That co-host request was rejected. Pick a user or a group and try again.
        </Alert>
      )}
      {cohost === 'error' && (
        <Alert variant="error" title="Co-host update failed">
          {cohostMsg ?? 'Something went wrong updating co-hosts.'}
        </Alert>
      )}
    </>
  );
}
