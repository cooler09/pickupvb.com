'use client';

import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import { EVENT_POSITIONS, EventPosition } from '@pickupvb/domain';
import { type Suggestion } from '@/components/address-autocomplete';
import DateTimePicker from '@/components/datetime-picker';
import AdvancedDetailsPanel, {
  type AdvancedDetailsInitial,
} from '@/components/event-advanced-details-panel';
import { Alert } from '@/components/alert';
import { ErrorActionLink } from '@/components/error-action-link';
import { useAlertReveal } from '@/components/use-alert-reveal';
import { FieldError, fieldA11y } from '@/components/field-error';
import { primaryButtonClass } from '@/components/primary-button';
import {
  DEFAULT_POSITION_ROSTER,
  inputClass,
  labelClass,
  PositionRosterGrid,
  SegmentedControl,
  type CapacityKind,
} from '../../new/_components/form-primitives';
import LocationFields from '../../new/_components/location-fields';
import { StripeOnboardingBanner, PaidEventCapBanner } from '../../new/_components/payment-fields';
import { editEventAction, type EditEventState } from './actions';

const initialState: EditEventState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={primaryButtonClass('md')}>
      {pending ? 'Saving…' : 'Save changes'}
    </button>
  );
}

/**
 * Refund-window input, Pro-gated. Free hosts see a disabled input pinned
 * to the 24-hour default with an upgrade nudge; Pro hosts get the full
 * 0–720h range. The server action enforces the same clamp regardless of
 * what's submitted (audit P1 #1 — custom refund policy gating).
 */
function RefundWindowField({
  defaultValue,
  disabled,
  viewerHasProBenefits,
}: {
  defaultValue: number;
  disabled: boolean;
  viewerHasProBenefits: boolean;
}) {
  return (
    <div>
      <label htmlFor="refundWindowHours" className={labelClass}>
        Refund window (hours)
        {!viewerHasProBenefits && <span className="text-muted ml-1 text-xs">(Pro)</span>}
      </label>
      <input
        id="refundWindowHours"
        name="refundWindowHours"
        type="number"
        min="0"
        max="720"
        step="1"
        defaultValue={viewerHasProBenefits ? defaultValue : 24}
        disabled={disabled || !viewerHasProBenefits}
        className={inputClass}
      />
      {!viewerHasProBenefits && (
        <p className="text-muted mt-1 text-xs">
          Free hosts use the 24-hour default.{' '}
          <Link href="/pricing" className="text-primary hover:underline">
            Upgrade to Pro
          </Link>{' '}
          to customize (0–720h).
        </p>
      )}
    </div>
  );
}

export type EditEventFormProps = {
  eventId: string;
  isOpenPlay: boolean;
  pricingLocked: boolean;
  viewerHasProBenefits: boolean;
  /** Host has a Stripe Connect account with charges enabled. Drives the
   *  proactive readiness banners (parity with the create form). */
  canCollectPayments: boolean;
  /** Free host already at their rolling-30d paid-event cap. */
  atPaidEventCap: boolean;
  /** Event currently has no price — so a price change here is a free→paid flip
   *  (the only case the server's cap check fires for). */
  currentlyFree: boolean;
  /** Tournament/league has at least one paid division (prices are edited
   *  elsewhere, so this is computed server-side and passed in). */
  hasPaidDivision: boolean;
  initial: {
    title: string;
    description: string;
    rules: string;
    skillTier: string;
    visibility: string;
    startsAt: Date;
    endsAt: Date;
    capacityKind: 'unlimited' | 'fixed' | null;
    maxSpots: number | null;
    /** Per-position targets when the event uses a by-position roster; null
     *  otherwise. A non-null value means the capacity mode is "By position". */
    positionRoster: Partial<Record<EventPosition, number>> | null;
    addressLine: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
    priceUsd: string;
    refundWindowHours: number;
    hostAbsorbsFee: boolean;
    passProcessingFeeToBuyer: boolean;
    paymentsOffPlatform: boolean;
    extensions: AdvancedDetailsInitial;
  };
};

export default function EditEventForm({
  eventId,
  isOpenPlay,
  pricingLocked,
  viewerHasProBenefits,
  canCollectPayments,
  atPaidEventCap,
  currentlyFree,
  hasPaidDivision,
  initial,
}: EditEventFormProps) {
  const [state, formAction] = useFormState(editEventAction, initialState);
  const errorRef = useAlertReveal(state, Boolean(state.error));
  // Capacity is a 3-way selector (Unlimited / Fixed / By position), matching the
  // create form (CE-11). A persisted `positionRoster` means the event is in
  // by-position mode (its DB `capacity_kind` is `unlimited`).
  const [capacityKind, setCapacityKind] = useState<CapacityKind>(
    initial.positionRoster
      ? 'by_position'
      : initial.capacityKind === 'fixed'
        ? 'fixed'
        : 'unlimited',
  );
  const byPosition = capacityKind === 'by_position';
  const [positionCounts, setPositionCounts] = useState<Record<EventPosition, number>>(() => {
    const base = { ...DEFAULT_POSITION_ROSTER };
    if (initial.positionRoster) {
      for (const pos of EVENT_POSITIONS) {
        const n = initial.positionRoster[pos];
        if (typeof n === 'number') base[pos] = Math.max(0, Math.floor(n));
      }
    }
    return base;
  });
  const positionTotal = Object.values(positionCounts).reduce((a, b) => a + b, 0);
  const [addressLine, setAddressLine] = useState(initial.addressLine);
  const [city, setCity] = useState(initial.city);
  const [region, setRegion] = useState(initial.region);
  const [postalCode, setPostalCode] = useState(initial.postalCode);
  const [country, setCountry] = useState(initial.country);
  const [startsAt, setStartsAt] = useState<Date | null>(initial.startsAt);
  const [endsAt, setEndsAt] = useState<Date | null>(initial.endsAt);
  // Controlled so we can hide on-platform-only controls (refund window,
  // service-fee absorption) when the host opts out of Stripe entirely, or can't
  // collect on-platform at all. Matches the gating in
  // apps/web/src/app/events/new/new-event-form.tsx.
  const [paymentsOffPlatform, setPaymentsOffPlatform] = useState(initial.paymentsOffPlatform);
  const showOnPlatformControls = canCollectPayments && !paymentsOffPlatform;
  // Track the open-play price client-side so the readiness banners can escalate
  // to blocking the moment a price is entered without Stripe — before submit,
  // instead of the server gate rolling it back (parity with PricingSubsection).
  const [priceUsd, setPriceUsd] = useState(initial.priceUsd);
  const hasPrice = Number(priceUsd) > 0;

  function applySuggestion(s: Suggestion) {
    setAddressLine(s.addressLine);
    setCity(s.city);
    setRegion(s.region);
    setPostalCode(s.postalCode);
    if (s.country) setCountry(s.country);
  }

  return (
    <form action={formAction} className="space-y-8">
      <input type="hidden" name="eventId" value={eventId} />

      {state.error && (
        <div ref={errorRef} tabIndex={-1} className="outline-none">
          <Alert variant="error">
            {state.error}
            <ErrorActionLink action={state.errorAction} />
          </Alert>
        </div>
      )}

      <fieldset className="space-y-4">
        <legend className="text-fg text-lg font-semibold">Basics</legend>
        <div>
          <label htmlFor="title" className={labelClass}>
            Title
          </label>
          <input
            id="title"
            name="title"
            required
            minLength={3}
            maxLength={120}
            defaultValue={initial.title}
            className={inputClass}
            {...fieldA11y('title', state.fieldErrors)}
          />
          <FieldError name="title" errors={state.fieldErrors} />
        </div>
        <div>
          <label htmlFor="description" className={labelClass}>
            Description <span className="text-fg/50">(optional)</span>
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            maxLength={4000}
            defaultValue={initial.description}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="rules" className={labelClass}>
            Rules <span className="text-fg/50">(optional)</span>
          </label>
          <textarea
            id="rules"
            name="rules"
            rows={2}
            maxLength={4000}
            defaultValue={initial.rules}
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {isOpenPlay && (
            <div>
              <label htmlFor="skillTier" className={labelClass}>
                Skill tier
              </label>
              <select
                id="skillTier"
                name="skillTier"
                defaultValue={initial.skillTier}
                className={inputClass}
              >
                <optgroup label="Beginner">
                  <option value="c">C</option>
                  <option value="b">B</option>
                </optgroup>
                <optgroup label="Intermediate">
                  <option value="bb">BB</option>
                  <option value="bb3">BB-3</option>
                </optgroup>
                <optgroup label="Advanced">
                  <option value="a">A</option>
                </optgroup>
                <optgroup label="Competitive">
                  <option value="aa">AA</option>
                  <option value="open">Open</option>
                </optgroup>
              </select>
            </div>
          )}
          <div>
            <label htmlFor="visibility" className={labelClass}>
              Visibility
            </label>
            <select
              id="visibility"
              name="visibility"
              defaultValue={initial.visibility}
              className={inputClass}
            >
              <option value="public">Public</option>
              <option value="invite_only">Invite only (unlisted — share by link)</option>
              <option value="friends_of_host">People the host follows</option>
              <option value="friends_of_attendees">People attendees follow</option>
            </select>
            <p className="text-muted mt-1 text-xs">
              Public events show up in search and the home feed. Unlisted events are reachable only
              by link; friends-only events stay within your network.
            </p>
          </div>
        </div>
      </fieldset>

      {isOpenPlay && (
        <fieldset className="border-border-base space-y-3 rounded-md border p-4">
          <legend className="text-fg px-1 text-sm font-semibold">Capacity</legend>
          {/* The action reads `capacityKind`; SegmentedControl is buttons, so
              carry the value in a hidden input. */}
          <input type="hidden" name="capacityKind" value={capacityKind} />
          <SegmentedControl<CapacityKind>
            value={capacityKind}
            ariaLabel="Capacity mode"
            onChange={setCapacityKind}
            options={[
              { value: 'unlimited', label: 'Unlimited' },
              { value: 'fixed', label: 'Fixed spots' },
              { value: 'by_position', label: 'By position' },
            ]}
          />
          {capacityKind === 'fixed' && (
            <div className="max-w-xs">
              <label htmlFor="maxSpots" className={labelClass}>
                Max spots
              </label>
              <input
                id="maxSpots"
                name="maxSpots"
                type="number"
                min={1}
                defaultValue={initial.maxSpots ?? ''}
                className={inputClass}
                {...fieldA11y('maxSpots', state.fieldErrors)}
              />
              <FieldError name="maxSpots" errors={state.fieldErrors} />
              <p className="text-muted mt-1 text-xs">Cannot drop below current attendee count.</p>
            </div>
          )}
          {byPosition && (
            <PositionRosterGrid
              positionCounts={positionCounts}
              setPositionCounts={setPositionCounts}
              positionTotal={positionTotal}
            />
          )}
        </fieldset>
      )}

      {isOpenPlay ? (
        <fieldset className="border-border-base space-y-3 rounded-md border p-4">
          <legend className="text-fg px-1 text-sm font-semibold">Pricing</legend>
          {pricingLocked && (
            <div className="border-md-warning/30 bg-md-warning-container text-md-on-warning-container rounded-md border p-2 text-xs">
              Pricing is locked because at least one ticket has been sold. Refund all attendees
              first to change price, fee, or refund window.
            </div>
          )}
          {atPaidEventCap && currentlyFree && hasPrice && !paymentsOffPlatform && (
            <PaidEventCapBanner />
          )}
          {!canCollectPayments && (
            <StripeOnboardingBanner
              blocking={hasPrice && !paymentsOffPlatform}
              onCollectOffPlatform={() => setPaymentsOffPlatform(true)}
            />
          )}
          <div
            className={`grid grid-cols-1 gap-3 ${showOnPlatformControls ? 'sm:grid-cols-3' : ''}`}
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
                disabled={pricingLocked}
                className={inputClass}
              />
            </div>
            {showOnPlatformControls && (
              <>
                <RefundWindowField
                  defaultValue={initial.refundWindowHours}
                  disabled={pricingLocked}
                  viewerHasProBenefits={viewerHasProBenefits}
                />
                <div className="flex items-end">
                  <label className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      name="hostAbsorbsFee"
                      defaultChecked={initial.hostAbsorbsFee}
                      disabled={pricingLocked}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="text-fg font-medium">Host absorbs the 5% service fee</span>
                      <span className="text-muted block">
                        Otherwise added on top of ticket price.
                      </span>
                    </span>
                  </label>
                </div>
                <div className="sm:col-span-2">
                  <label className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      name="passProcessingFeeToBuyer"
                      defaultChecked={initial.passProcessingFeeToBuyer}
                      disabled={pricingLocked}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="text-fg font-medium">
                        Pass Stripe&apos;s processing fee (~$1/ticket) to the buyer
                      </span>
                      <span className="text-muted block">
                        Buyer sees a separate &ldquo;Processing fee&rdquo; line at checkout so you
                        receive the full advertised price. Ignored if you absorb the service fee
                        above.
                      </span>
                    </span>
                  </label>
                </div>
              </>
            )}
          </div>
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              name="paymentsOffPlatform"
              checked={paymentsOffPlatform}
              onChange={(e) => setPaymentsOffPlatform(e.target.checked)}
              disabled={pricingLocked}
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
        </fieldset>
      ) : (
        <fieldset className="border-border-base space-y-3 rounded-md border p-4">
          <legend className="text-fg px-1 text-sm font-semibold">Payment settings</legend>
          {pricingLocked && (
            <div className="border-md-warning/30 bg-md-warning-container text-md-on-warning-container rounded-md border p-2 text-xs">
              Payment settings are locked because at least one ticket has been sold.
            </div>
          )}
          {!canCollectPayments && (
            <StripeOnboardingBanner
              blocking={hasPaidDivision && !paymentsOffPlatform}
              onCollectOffPlatform={() => setPaymentsOffPlatform(true)}
            />
          )}
          <p className="text-muted text-xs">
            Entry prices are managed per division on the{' '}
            <Link href={`/events/${eventId}`} className="text-primary hover:underline">
              event page
            </Link>
            .
          </p>
          {showOnPlatformControls && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <RefundWindowField
                defaultValue={initial.refundWindowHours}
                disabled={pricingLocked}
                viewerHasProBenefits={viewerHasProBenefits}
              />
              <div className="flex items-end">
                <label className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    name="hostAbsorbsFee"
                    defaultChecked={initial.hostAbsorbsFee}
                    disabled={pricingLocked}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="text-fg font-medium">Host absorbs the 5% service fee</span>
                    <span className="text-muted block">
                      Otherwise added on top of ticket price.
                    </span>
                  </span>
                </label>
              </div>
              <div className="sm:col-span-2">
                <label className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    name="passProcessingFeeToBuyer"
                    defaultChecked={initial.passProcessingFeeToBuyer}
                    disabled={pricingLocked}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="text-fg font-medium">
                      Pass Stripe&apos;s processing fee (~$1/ticket) to the buyer
                    </span>
                    <span className="text-muted block">
                      Buyer sees a separate &ldquo;Processing fee&rdquo; line at checkout so you
                      receive the full advertised price. Ignored if you absorb the service fee
                      above.
                    </span>
                  </span>
                </label>
              </div>
            </div>
          )}
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              name="paymentsOffPlatform"
              checked={paymentsOffPlatform}
              onChange={(e) => setPaymentsOffPlatform(e.target.checked)}
              disabled={pricingLocked}
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
        </fieldset>
      )}

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="text-fg col-span-full text-lg font-semibold">When</legend>
        <div>
          <label htmlFor="startsAt" className={labelClass}>
            Starts at
          </label>
          <DateTimePicker
            name="startsAt"
            value={startsAt}
            onChange={setStartsAt}
            inputClass={inputClass}
          />
          <FieldError name="startsAt" errors={state.fieldErrors} />
        </div>
        <div>
          <label htmlFor="endsAt" className={labelClass}>
            Ends at
          </label>
          <DateTimePicker
            name="endsAt"
            value={endsAt}
            onChange={setEndsAt}
            {...(startsAt ? { minDate: startsAt } : {})}
            inputClass={inputClass}
          />
          <FieldError name="endsAt" errors={state.fieldErrors} />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-fg text-lg font-semibold">Location</legend>
        <LocationFields
          addressLine={addressLine}
          setAddressLine={setAddressLine}
          city={city}
          setCity={setCity}
          region={region}
          setRegion={setRegion}
          postalCode={postalCode}
          setPostalCode={setPostalCode}
          country={country}
          setCountry={setCountry}
          onPick={applySuggestion}
          fieldErrors={state.fieldErrors}
        />
      </fieldset>

      <AdvancedDetailsPanel initial={initial.extensions} />

      <div className="border-border-base bg-md-surface-container/95 sticky bottom-2 z-10 -mx-2 flex items-center justify-between gap-3 rounded-md border px-3 py-2 shadow-sm backdrop-blur">
        <Link href={`/events/${eventId}`} className="text-primary text-sm hover:underline">
          ← Cancel
        </Link>
        <SubmitButton />
      </div>
    </form>
  );
}
