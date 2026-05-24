import Link from 'next/link';
import { Alert } from '@/components/alert';
import {
  removeSponsor,
  startSponsorSlotCheckoutFromForm,
  upsertSponsorFromForm,
} from './sponsor-actions';

type Sponsor = {
  name: string;
  blurb: string | null;
  linkUrl: string | null;
  logoUrl: string | null;
  discountCode: string | null;
};

const labelClass = 'block text-sm font-medium text-fg';
const inputClass =
  'mt-1 block w-full rounded-md border border-border-base bg-surface px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary';

export function SponsorPanel({
  eventId,
  returnPath,
  sponsor,
  canUseSponsors,
  sponsorFlash,
  sponsorMsg,
}: {
  eventId: string;
  returnPath: string;
  sponsor: Sponsor | null;
  canUseSponsors: boolean;
  sponsorFlash?: string;
  sponsorMsg?: string;
}) {
  const saveAction = upsertSponsorFromForm.bind(null, eventId, returnPath);
  const unlockAction = startSponsorSlotCheckoutFromForm.bind(null, eventId, returnPath);
  const removeAction = removeSponsor.bind(null, eventId, returnPath);

  return (
    <section className="border-border-base space-y-4 rounded-lg border p-4">
      <header className="space-y-1">
        <h2 className="text-fg text-lg font-semibold">Sponsor slot (Pro)</h2>
        <p className="text-muted text-sm">
          Add one host-owned sponsor block to the event page. Keep copy short and local.
        </p>
      </header>

      {sponsorFlash === 'saved' && (
        <Alert variant="success" title="Sponsor saved">
          The sponsor block will appear on the event page.
        </Alert>
      )}
      {sponsorFlash === 'removed' && (
        <Alert variant="success" title="Sponsor removed">
          The event no longer shows a sponsor block.
        </Alert>
      )}
      {sponsorFlash === 'pro' && (
        <Alert variant="warning" title="Pro required">
          Sponsor slots are included with Pro, or unlockable as a one-time purchase.{' '}
          <Link href="/pricing" className="underline">
            See pricing
          </Link>
          .
        </Alert>
      )}
      {sponsorFlash === 'checkout_success' && (
        <Alert variant="info" title="Payment received">
          Sponsor payment succeeded. We&apos;re finalizing your sponsor block now.
        </Alert>
      )}
      {sponsorFlash === 'checkout_cancel' && (
        <Alert variant="warning" title="Checkout canceled">
          Sponsor unlock checkout was canceled.
        </Alert>
      )}
      {sponsorFlash === 'unauthorized' && (
        <Alert variant="error" title="Not allowed">
          You can&apos;t manage sponsors for this event.
        </Alert>
      )}
      {sponsorFlash === 'notfound' && (
        <Alert variant="error" title="Event not found">
          The event could not be found.
        </Alert>
      )}
      {sponsorFlash === 'invalid' && (
        <Alert variant="error" title="Invalid sponsor details">
          {sponsorMsg ?? 'Please fix the sponsor fields and try again.'}
        </Alert>
      )}
      {sponsorFlash === 'error' && (
        <Alert variant="error" title="Could not save sponsor">
          {sponsorMsg ?? 'Please try again.'}
        </Alert>
      )}

      {!canUseSponsors && (
        <Alert variant="info" title="Unlock sponsor slot">
          Upgrade to Pro for included sponsor slots, or pay a one-time $3 unlock for this event.
        </Alert>
      )}

      <form action={canUseSponsors ? saveAction : unlockAction} className="space-y-4">
        <div>
          <label htmlFor="sponsor-name" className={labelClass}>
            Sponsor name
          </label>
          <input
            id="sponsor-name"
            name="name"
            required
            minLength={1}
            maxLength={80}
            defaultValue={sponsor?.name ?? ''}
            className={inputClass}
            disabled={!canUseSponsors}
          />
        </div>

        <div>
          <label htmlFor="sponsor-blurb" className={labelClass}>
            One-line blurb
          </label>
          <input
            id="sponsor-blurb"
            name="blurb"
            maxLength={140}
            defaultValue={sponsor?.blurb ?? ''}
            className={inputClass}
            disabled={!canUseSponsors}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="sponsor-link" className={labelClass}>
              Sponsor link (https://)
            </label>
            <input
              id="sponsor-link"
              name="link_url"
              type="url"
              maxLength={300}
              defaultValue={sponsor?.linkUrl ?? ''}
              className={inputClass}
              disabled={!canUseSponsors}
            />
          </div>
          <div>
            <label htmlFor="sponsor-logo" className={labelClass}>
              Logo image URL (https://)
            </label>
            <input
              id="sponsor-logo"
              name="logo_url"
              type="url"
              maxLength={300}
              defaultValue={sponsor?.logoUrl ?? ''}
              className={inputClass}
              disabled={!canUseSponsors}
            />
          </div>
        </div>

        <div>
          <label htmlFor="sponsor-code" className={labelClass}>
            Discount code (optional)
          </label>
          <input
            id="sponsor-code"
            name="discount_code"
            maxLength={32}
            defaultValue={sponsor?.discountCode ?? ''}
            className={inputClass}
            disabled={!canUseSponsors}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={false}
            className="bg-primary hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
          >
            {canUseSponsors ? 'Save sponsor' : 'Unlock sponsor slot ($3)'}
          </button>

          {sponsor && canUseSponsors && (
            <button
              type="submit"
              formAction={removeAction}
              className="border-border-base text-fg rounded-md border px-4 py-2 text-sm font-semibold"
            >
              Remove sponsor
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
