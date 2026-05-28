'use client';

import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import AddressAutocomplete, { type Suggestion } from '@/components/address-autocomplete';
import DateTimePicker from '@/components/datetime-picker';
import AdvancedDetailsPanel, {
  type AdvancedDetailsInitial,
} from '@/components/event-advanced-details-panel';
import { Alert } from '@/components/alert';
import { FieldError, fieldA11y } from '@/components/field-error';
import { primaryButtonClass } from '@/components/primary-button';
import { editEventAction, type EditEventState } from './actions';

const initialState: EditEventState = {};

const labelClass = 'block text-sm font-medium text-fg';
const inputClass =
  'mt-1 block w-full rounded-md border border-border-base bg-surface px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary';

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
  initial,
}: EditEventFormProps) {
  const [state, formAction] = useFormState(editEventAction, initialState);
  const [capacityKind, setCapacityKind] = useState<'unlimited' | 'fixed'>(
    initial.capacityKind === 'fixed' ? 'fixed' : 'unlimited',
  );
  const [addressLine, setAddressLine] = useState(initial.addressLine);
  const [city, setCity] = useState(initial.city);
  const [region, setRegion] = useState(initial.region);
  const [postalCode, setPostalCode] = useState(initial.postalCode);
  const [country, setCountry] = useState(initial.country);
  const [startsAt, setStartsAt] = useState<Date | null>(initial.startsAt);
  const [endsAt, setEndsAt] = useState<Date | null>(initial.endsAt);
  // Controlled so we can hide on-platform-only controls (refund window,
  // service-fee absorption) when the host opts out of Stripe entirely.
  // Matches the gating in apps/web/src/app/events/new/new-event-form.tsx.
  const [paymentsOffPlatform, setPaymentsOffPlatform] = useState(initial.paymentsOffPlatform);
  const showOnPlatformControls = !paymentsOffPlatform;

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

      {state.error && <Alert variant="error">{state.error}</Alert>}

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
              {!viewerHasProBenefits && <span className="text-muted ml-1 text-xs">(Pro)</span>}
            </label>
            <select
              id="visibility"
              name="visibility"
              defaultValue={viewerHasProBenefits ? initial.visibility : 'public'}
              disabled={!viewerHasProBenefits}
              className={inputClass}
            >
              <option value="public">Public</option>
              <option value="invite_only">Invite only (unlisted — share by link)</option>
              <option value="friends_of_host">People the host follows</option>
              <option value="friends_of_attendees">People attendees follow</option>
            </select>
            {!viewerHasProBenefits && (
              <p className="text-muted mt-1 text-xs">
                Free events are public.{' '}
                <Link href="/pricing" className="text-primary hover:underline">
                  Upgrade to Pro
                </Link>{' '}
                to host unlisted or friends-only events.
              </p>
            )}
          </div>
        </div>
      </fieldset>

      {isOpenPlay && (
        <fieldset className="border-border-base space-y-3 rounded-md border p-4">
          <legend className="text-fg px-1 text-sm font-semibold">Capacity</legend>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="capacityKind"
                value="unlimited"
                checked={capacityKind === 'unlimited'}
                onChange={() => setCapacityKind('unlimited')}
              />
              Unlimited
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="capacityKind"
                value="fixed"
                checked={capacityKind === 'fixed'}
                onChange={() => setCapacityKind('fixed')}
              />
              Fixed spots
            </label>
          </div>
          {capacityKind === 'fixed' && (
            <div>
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
        </fieldset>
      )}

      {isOpenPlay ? (
        <fieldset className="border-border-base space-y-3 rounded-md border p-4">
          <legend className="text-fg px-1 text-sm font-semibold">Pricing</legend>
          {pricingLocked && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              Pricing is locked because at least one ticket has been sold. Refund all attendees
              first to change price, fee, or refund window.
            </div>
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
                defaultValue={initial.priceUsd}
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
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              Payment settings are locked because at least one ticket has been sold.
            </div>
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
        <div>
          <label htmlFor="addressSearch" className={labelClass}>
            Search address or venue
          </label>
          <AddressAutocomplete onPick={applySuggestion} inputClass={inputClass} />
        </div>
        <div>
          <label htmlFor="addressLine" className={labelClass}>
            Address
          </label>
          <input
            id="addressLine"
            name="addressLine"
            required
            maxLength={200}
            value={addressLine}
            onChange={(e) => setAddressLine(e.target.value)}
            className={inputClass}
            {...fieldA11y('addressLine', state.fieldErrors)}
          />
          <FieldError name="addressLine" errors={state.fieldErrors} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="city" className={labelClass}>
              City
            </label>
            <input
              id="city"
              name="city"
              required
              maxLength={100}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="region" className={labelClass}>
              State / region
            </label>
            <input
              id="region"
              name="region"
              maxLength={100}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="postalCode" className={labelClass}>
              Postal code
            </label>
            <input
              id="postalCode"
              name="postalCode"
              maxLength={20}
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="country" className={labelClass}>
              Country
            </label>
            <input
              id="country"
              name="country"
              required
              maxLength={100}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </fieldset>

      <AdvancedDetailsPanel initial={initial.extensions} />

      <div className="border-border-base bg-surface/95 sticky bottom-2 z-10 -mx-2 flex items-center justify-between gap-3 rounded-md border px-3 py-2 shadow-sm backdrop-blur">
        <Link href={`/events/${eventId}`} className="text-primary text-sm hover:underline">
          ← Cancel
        </Link>
        <SubmitButton />
      </div>
    </form>
  );
}
