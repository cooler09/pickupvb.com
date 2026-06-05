'use client';

/**
 * Payment-related form sections for the create-event form (architecture audit
 * P3-1). Grouped together because they share the `StripeOnboardingBanner` +
 * `RefundWindowField` leaves: `PricingSubsection` (open-play, single price) and
 * `PaymentSettingsSubsection` (tournament, per-division prices set elsewhere).
 */
import Link from 'next/link';
import { useState } from 'react';
import { Alert } from '@/components/alert';
import { FieldError, fieldA11y } from '@/components/field-error';
import { chk, inputClass, labelClass, val } from './form-primitives';

/**
 * Inline banner shown when the host has no Stripe Connect account with
 * charges enabled.
 *
 * It has two states so the host learns whether they can charge *before*
 * hitting submit (instead of getting the event rolled back server-side):
 *
 * - **Heads-up** (`blocking` false): a calm info note that on-platform
 *   payments aren't set up, with the path to finish Stripe onboarding.
 * - **Blocking** (`blocking` true): once a price has been entered without
 *   the off-platform option, escalate to an actionable warning — finish
 *   Stripe setup, or switch to off-platform collection in one click.
 */
export function StripeOnboardingBanner({
  blocking = false,
  onCollectOffPlatform,
}: {
  /**
   * True once the host has entered a price but hasn't opted into
   * off-platform collection — i.e. the event can't actually be created on
   * the current (Stripe-less) account.
   */
  blocking?: boolean;
  /** Switch the form into off-platform mode (ticks the box for them). */
  onCollectOffPlatform?: (() => void) | undefined;
}) {
  if (blocking) {
    return (
      <Alert variant="warning" title="Set up Stripe to charge for this event">
        You&apos;ve entered a price, but you can&apos;t accept payments through PickupVB yet.{' '}
        <Link href="/profile/billing" className="font-medium underline underline-offset-2">
          Finish Stripe setup
        </Link>{' '}
        to take cards online — or{' '}
        <button
          type="button"
          onClick={onCollectOffPlatform}
          className="font-medium underline underline-offset-2"
        >
          collect payment yourself
        </button>{' '}
        (cash, Venmo, etc.).
      </Alert>
    );
  }
  return (
    <Alert variant="info" title="On-platform payments aren't set up yet">
      To accept card payments through PickupVB,{' '}
      <Link href="/profile/billing" className="font-medium underline underline-offset-2">
        finish Stripe onboarding
      </Link>
      . Otherwise you can still list a price and collect it yourself (cash, Venmo, etc.) with the
      off-platform option below.
    </Alert>
  );
}

/**
 * Refund-window input. Pro hosts can configure any value in 0–720h; free
 * hosts see a disabled input pinned to the 24h default with an upgrade
 * nudge. The server action enforces the same clamp regardless of what's
 * submitted (audit P1 #1 sub-item — custom refund policy gating).
 */
export function RefundWindowField({
  values,
  viewerHasProBenefits,
}: {
  values: Record<string, string> | undefined;
  viewerHasProBenefits: boolean;
}) {
  const defaultValue = viewerHasProBenefits ? val(values, 'refundWindowHours', '24') : '24';
  return (
    <div>
      <label htmlFor="refundWindowHours" className={labelClass}>
        Refund window (h)
        {!viewerHasProBenefits && <span className="text-muted ml-1 text-xs">(Pro)</span>}
      </label>
      <input
        id="refundWindowHours"
        name="refundWindowHours"
        type="number"
        min="0"
        max="720"
        step="1"
        defaultValue={defaultValue}
        disabled={!viewerHasProBenefits}
        className={inputClass}
      />
      <p className="text-muted mt-1 text-xs">
        {viewerHasProBenefits ? (
          'Hours before start when self-cancel refunds work. 0 disables.'
        ) : (
          <>
            Free hosts use the 24-hour default.{' '}
            <Link href="/pricing" className="text-primary hover:underline">
              Upgrade to Pro
            </Link>{' '}
            to customize (0–720h).
          </>
        )}
      </p>
    </div>
  );
}

export function PricingSubsection({
  fieldErrors,
  values,
  submitted,
  canCollectPayments,
  paymentsOffPlatform,
  setPaymentsOffPlatform,
  viewerHasProBenefits,
}: {
  fieldErrors: Record<string, string> | undefined;
  values: Record<string, string> | undefined;
  submitted: boolean | undefined;
  canCollectPayments: boolean;
  paymentsOffPlatform: boolean;
  setPaymentsOffPlatform: (v: boolean) => void;
  viewerHasProBenefits: boolean;
}) {
  // Track the price client-side so we can warn — before submit — when a host
  // who isn't set up for on-platform payments enters a price without choosing
  // off-platform collection (otherwise the server rolls the event back).
  const [priceUsd, setPriceUsd] = useState(val(values, 'priceUsd', '0'));
  const hasPrice = Number(priceUsd) > 0;
  const showOnPlatformControls = canCollectPayments && !paymentsOffPlatform;
  return (
    <div className="border-border-base space-y-3 border-t pt-4">
      <div>
        <p className={labelClass}>Pricing</p>
        <p className="text-muted mt-1 text-xs">
          Leave at $0 for free.
          {canCollectPayments
            ? ' Uncheck the off-platform option below to charge through Stripe.'
            : ''}
        </p>
      </div>
      {!canCollectPayments && (
        <StripeOnboardingBanner
          blocking={hasPrice && !paymentsOffPlatform}
          onCollectOffPlatform={() => setPaymentsOffPlatform(true)}
        />
      )}
      <label className="flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          name="paymentsOffPlatform"
          checked={paymentsOffPlatform}
          onChange={(e) => setPaymentsOffPlatform(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="text-fg font-medium">
            I&apos;ll collect payment myself (off-platform)
          </span>
          <span className="text-muted block">
            Display the price but skip Stripe. Players RSVP without paying online.
          </span>
        </span>
      </label>
      <div>
        <label htmlFor="paymentInstructionsOpen" className={labelClass}>
          Payment instructions <span className="text-fg/50">(optional)</span>
        </label>
        <textarea
          id="paymentInstructionsOpen"
          name="paymentInstructions"
          rows={2}
          maxLength={2000}
          defaultValue={val(values, 'paymentInstructions')}
          placeholder="e.g. Venmo @league-org or pay at check-in (cash/card)."
          className={inputClass}
        />
      </div>
      <div
        className={
          showOnPlatformControls
            ? 'grid grid-cols-1 gap-3 sm:grid-cols-3'
            : 'grid grid-cols-1 gap-3 sm:max-w-xs'
        }
      >
        <div>
          <label htmlFor="priceUsd" className={labelClass}>
            Price (USD)
          </label>
          <input
            id="priceUsd"
            name="priceUsd"
            type="number"
            min="0"
            max="10000"
            step="0.01"
            value={priceUsd}
            onChange={(e) => setPriceUsd(e.target.value)}
            className={inputClass}
            {...fieldA11y('priceCents', fieldErrors)}
          />
        </div>
        {showOnPlatformControls && (
          <>
            <RefundWindowField values={values} viewerHasProBenefits={viewerHasProBenefits} />
            <div className="flex items-end">
              <label className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  name="hostAbsorbsFee"
                  defaultChecked={chk(values, submitted, 'hostAbsorbsFee', false)}
                  className="mt-0.5"
                />
                <span>
                  <span className="text-fg font-medium">Absorb the 5% service fee</span>
                  <span className="text-muted block">Otherwise added to ticket price.</span>
                </span>
              </label>
            </div>
            <div className="sm:col-span-2">
              <label className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  name="passProcessingFeeToBuyer"
                  defaultChecked={chk(values, submitted, 'passProcessingFeeToBuyer', true)}
                  className="mt-0.5"
                />
                <span>
                  <span className="text-fg font-medium">
                    Pass Stripe&apos;s processing fee (~$1/ticket) to the buyer
                  </span>
                  <span className="text-muted block">
                    Buyer sees a separate &ldquo;Processing fee&rdquo; line at checkout so you
                    receive the full advertised price. Disable to absorb it yourself. Ignored if you
                    absorb the service fee above.
                  </span>
                </span>
              </label>
            </div>
          </>
        )}
      </div>
      <FieldError name="priceCents" errors={fieldErrors} />
    </div>
  );
}

export function PaymentSettingsSubsection({
  values,
  submitted,
  canCollectPayments,
  hasPaidDivision,
  paymentsOffPlatform,
  setPaymentsOffPlatform,
  viewerHasProBenefits,
}: {
  values: Record<string, string> | undefined;
  submitted: boolean | undefined;
  canCollectPayments: boolean;
  /** True when any division has a non-zero entry price (per-division pricing
   *  lives in the divisions repeater above this subsection). */
  hasPaidDivision: boolean;
  paymentsOffPlatform: boolean;
  setPaymentsOffPlatform: (v: boolean) => void;
  viewerHasProBenefits: boolean;
}) {
  // Refund window + service-fee absorption only apply to on-platform
  // (Stripe-mediated) charges. Hide them when payments are off-platform
  // or the host can't accept on-platform payments at all.
  const showOnPlatformControls = canCollectPayments && !paymentsOffPlatform;
  return (
    <div className="border-border-base space-y-3 border-t pt-4">
      <div>
        <p className={labelClass}>Payment settings</p>
        <p className="text-muted mt-1 text-xs">
          Entry prices are set per division above.
          {canCollectPayments
            ? ' Uncheck the off-platform option below to charge through Stripe.'
            : ''}
        </p>
      </div>
      {!canCollectPayments && (
        <StripeOnboardingBanner
          blocking={hasPaidDivision && !paymentsOffPlatform}
          onCollectOffPlatform={() => setPaymentsOffPlatform(true)}
        />
      )}
      <label className="flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          name="paymentsOffPlatform"
          checked={paymentsOffPlatform}
          onChange={(e) => setPaymentsOffPlatform(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="text-fg font-medium">
            I&apos;ll collect payment myself (off-platform)
          </span>
          <span className="text-muted block">
            Display the price but skip Stripe. Players RSVP without paying online.
          </span>
        </span>
      </label>
      <div>
        <label htmlFor="paymentInstructionsTourney" className={labelClass}>
          Payment instructions <span className="text-fg/50">(optional)</span>
        </label>
        <textarea
          id="paymentInstructionsTourney"
          name="paymentInstructions"
          rows={2}
          maxLength={2000}
          defaultValue={val(values, 'paymentInstructions')}
          placeholder="e.g. Venmo @league-org or pay at check-in (cash/card)."
          className={inputClass}
        />
      </div>
      {showOnPlatformControls && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <RefundWindowField values={values} viewerHasProBenefits={viewerHasProBenefits} />
          <div className="flex items-end">
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                name="hostAbsorbsFee"
                defaultChecked={chk(values, submitted, 'hostAbsorbsFee', false)}
                className="mt-0.5"
              />
              <span>
                <span className="text-fg font-medium">Absorb the 5% service fee</span>
                <span className="text-muted block">Otherwise added to ticket price.</span>
              </span>
            </label>
          </div>
        </div>
      )}
      {showOnPlatformControls && (
        <div>
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              name="passProcessingFeeToBuyer"
              defaultChecked={chk(values, submitted, 'passProcessingFeeToBuyer', true)}
              className="mt-0.5"
            />
            <span>
              <span className="text-fg font-medium">
                Pass Stripe&apos;s processing fee (~$1/ticket) to the buyer
              </span>
              <span className="text-muted block">
                Buyer sees a separate &ldquo;Processing fee&rdquo; line at checkout so you receive
                the full advertised price. Disable to absorb it yourself. Ignored if you absorb the
                service fee above.
              </span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
