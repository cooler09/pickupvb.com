import Link from 'next/link';
import type { Route } from 'next';
import { getViewer } from '@/lib/server-auth';
import {
  getEventWaiver,
  getViewerSignature,
  type EventWaiver,
  type ViewerSignature,
} from '@/lib/waivers';
import { SubmitButton } from '@/components/submit-button';
import { primaryButtonClass } from '@/components/primary-button';
import { Alert } from '@/components/alert';
import { fieldInputClass } from '@/components/field-styles';
import { signWaiver } from '../waiver-actions';

/**
 * Liability-waiver section on the event detail page (monetization O-9). Shows
 * the host's waiver text + a click-wrap sign affordance. Soft: it never blocks
 * registration. Fully defensive (returns null on any read error / no waiver);
 * JSX renders outside the try/catch (react-hooks/error-boundaries).
 */

type PanelData = { waiver: EventWaiver; signedIn: boolean; signature: ViewerSignature | null };

async function load(eventId: string): Promise<PanelData | null> {
  try {
    const waiver = await getEventWaiver(eventId);
    if (!waiver) return null;
    const viewer = await getViewer();
    const signature = viewer ? await getViewerSignature(eventId, viewer.user.id) : null;
    return { waiver, signedIn: Boolean(viewer), signature };
  } catch {
    return null;
  }
}

export async function EventWaiverSection({
  eventId,
  flashCode,
}: {
  eventId: string;
  flashCode?: string;
}) {
  const data = await load(eventId);
  if (!data) return null;
  const { waiver, signedIn, signature } = data;
  const signedCurrent = signature !== null && signature.waiverVersion === waiver.version;

  return (
    <section className="border-border-base bg-md-surface-container rounded-shape-sm space-y-3 border p-4">
      <h2 className="text-fg text-lg font-semibold">{waiver.title}</h2>
      {waiver.externalUrl && (
        <a
          href={waiver.externalUrl}
          target="_blank"
          rel="noopener noreferrer nofollow ugc"
          className="text-primary block text-sm font-medium hover:underline"
        >
          Read the full waiver ↗
        </a>
      )}
      {waiver.body && (
        <details className="group">
          <summary className="text-primary cursor-pointer text-sm font-medium">
            {waiver.externalUrl ? 'Or read it here' : 'Read the waiver'}
          </summary>
          <p className="text-fg/90 mt-2 max-h-64 overflow-y-auto text-sm whitespace-pre-wrap">
            {waiver.body}
          </p>
        </details>
      )}

      {flashCode === 'need_name' && <Alert variant="error">Please type your name to sign.</Alert>}
      {flashCode === 'need_agree' && (
        <Alert variant="error">Please check the box to agree before signing.</Alert>
      )}
      {flashCode === 'error' && (
        <Alert variant="error">Couldn&apos;t record your signature — please try again.</Alert>
      )}

      {signedCurrent ? (
        <p className="text-md-success text-sm">
          ✓ You acknowledged this on {new Date(signature!.signedAt).toLocaleDateString()}.
        </p>
      ) : !signedIn ? (
        <p className="text-muted text-sm">
          <Link
            href={`/login?next=/events/${eventId}` as Route}
            className="text-primary hover:underline"
          >
            Sign in
          </Link>{' '}
          to sign this waiver.
        </p>
      ) : (
        <form action={signWaiver.bind(null, eventId)} className="space-y-2">
          {signature && (
            <p className="text-muted text-sm">
              The host updated this waiver since you signed — please review and re-sign.
            </p>
          )}
          <input
            name="signed_name"
            required
            maxLength={120}
            placeholder="Type your full name"
            aria-label="Your full name"
            className={fieldInputClass}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="agree" className="h-4 w-4" />I have read and agree to this
            waiver.
          </label>
          <SubmitButton className={primaryButtonClass('sm')} pendingChildren="Signing…">
            Sign waiver
          </SubmitButton>
        </form>
      )}
    </section>
  );
}
