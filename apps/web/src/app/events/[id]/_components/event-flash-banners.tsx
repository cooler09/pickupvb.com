import { Alert } from '@/components/alert';

export function EventFlashBanners({
  created,
  tip,
  tipMsg,
  cohost,
  cohostMsg,
}: {
  created: string | undefined;
  tip: string | undefined;
  tipMsg: string | undefined;
  cohost: string | undefined;
  cohostMsg: string | undefined;
}) {
  return (
    <>
      {created === '1' && (
        <Alert variant="success" title="Event created!">
          Share the link above or invite co-hosts so players can find your event.
        </Alert>
      )}
      {tip === 'thanks' && (
        <div className="rounded-shape-sm border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
          Thanks for tipping the host!
        </div>
      )}
      {tip === 'cancel' && (
        <div className="border-border-base bg-surface rounded-shape-sm border p-3 text-sm">
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
