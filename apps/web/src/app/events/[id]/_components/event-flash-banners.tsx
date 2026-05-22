import { Alert } from '@/components/alert';

export function EventFlashBanners({
  created,
  tip,
  tipMsg,
}: {
  created: string | undefined;
  tip: string | undefined;
  tipMsg: string | undefined;
}) {
  return (
    <>
      {created === '1' && (
        <Alert variant="success" title="Event created!">
          Share the link above or invite co-hosts so players can find your event.
        </Alert>
      )}
      {tip === 'thanks' && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
          Thanks for tipping the host!
        </div>
      )}
      {tip === 'cancel' && (
        <div className="border-border-base bg-surface rounded-lg border p-3 text-sm">
          Tip cancelled.
        </div>
      )}
      {tip === 'error' && (
        <div className="border-secondary bg-secondary/10 rounded-lg border p-3 text-sm">
          {tipMsg ?? 'Could not process tip.'}
        </div>
      )}
    </>
  );
}
