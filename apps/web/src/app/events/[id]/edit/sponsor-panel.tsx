import Link from 'next/link';
import { neutralButtonClass, primaryButtonClass } from '@/components/primary-button';
import { Alert } from '@/components/alert';
import { SPONSOR_SLOT_UNLOCK_CENTS } from '@/lib/pro';
import { SponsorLogoUpload } from './sponsor-logo-upload';
import {
  removeSponsor,
  startSponsorSlotCheckoutFromForm,
  upsertSponsorFromForm,
} from './sponsor-actions';
import {
  fieldInputClass as inputClass,
  fieldLabelClass as labelClass,
} from '@/components/field-styles';

/** Single source of truth for the à-la-carte price (mirrors pricing/Pro pages). */
const SPONSOR_SLOT_PRICE_USD = SPONSOR_SLOT_UNLOCK_CENTS / 100;

type Sponsor = {
  name: string;
  blurb: string | null;
  linkUrl: string | null;
  logoUrl: string | null;
  discountCode: string | null;
};

export function SponsorPanel({
  eventId,
  userId,
  returnPath,
  sponsor,
  canUseSponsors,
  sponsorFlash,
  sponsorMsg,
}: {
  eventId: string;
  userId: string;
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
    <section className="border-border-base rounded-shape-sm space-y-4 border p-4">
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
          Upgrade to Pro for included sponsor slots, or pay a one-time ${SPONSOR_SLOT_PRICE_USD}{' '}
          unlock for this event.
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
          />
        </div>

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
          />
        </div>

        <SponsorLogoUpload
          eventId={eventId}
          userId={userId}
          currentUrl={sponsor?.logoUrl ?? null}
        />

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
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="submit" className={primaryButtonClass('md')}>
            {canUseSponsors ? 'Save sponsor' : `Unlock sponsor slot ($${SPONSOR_SLOT_PRICE_USD})`}
          </button>

          {sponsor && canUseSponsors && (
            <button type="submit" formAction={removeAction} className={neutralButtonClass('md')}>
              Remove sponsor
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
