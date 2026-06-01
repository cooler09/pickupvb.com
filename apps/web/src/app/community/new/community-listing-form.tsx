'use client';

import Link from 'next/link';
import { primaryButtonClass } from '@/components/primary-button';
import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import AddressAutocomplete, { type Suggestion } from '@/components/address-autocomplete';
import DateTimePicker from '@/components/datetime-picker';
import { FieldError, fieldA11y } from '@/components/field-error';
import { createCommunityListingAction, type CreateCommunityListingState } from './actions';
import {
  fieldInputClass as inputClass,
  fieldLabelClass as labelClass,
} from '@/components/field-styles';

const initialState: CreateCommunityListingState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={primaryButtonClass('md')}>
      {pending ? 'Submitting…' : 'Submit listing'}
    </button>
  );
}

export default function NewCommunityListingForm() {
  const [state, formAction] = useFormState(createCommunityListingAction, initialState);
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('');
  const [startsAt, setStartsAt] = useState<Date | null>(null);
  const [endsAt, setEndsAt] = useState<Date | null>(null);

  function applySuggestion(s: Suggestion) {
    setAddressLine(s.addressLine);
    setCity(s.city);
    setRegion(s.region);
    setPostalCode(s.postalCode);
    if (s.country) setCountry(s.country);
  }

  return (
    <form action={formAction} className="space-y-8">
      {state.error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {state.error}
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
            maxLength={200}
            placeholder="Saturday morning beach league"
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
            rows={4}
            maxLength={4000}
            placeholder="What's the format, cost, what to bring, etc."
            className={inputClass}
            {...fieldA11y('description', state.fieldErrors)}
          />
          <FieldError name="description" errors={state.fieldErrors} />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-fg text-lg font-semibold">Where to RSVP</legend>
        <p className="text-muted text-xs">
          Paste the public link where attendees can sign up — a Facebook event, Meetup page,
          Eventbrite, etc. Must start with <code>https://</code> and not be a pickupvb.com URL.
        </p>
        <div>
          <label htmlFor="externalUrl" className={labelClass}>
            External URL
          </label>
          <input
            id="externalUrl"
            name="externalUrl"
            type="url"
            required
            placeholder="https://www.facebook.com/events/..."
            className={inputClass}
            {...fieldA11y('externalUrl', state.fieldErrors)}
          />
          <FieldError name="externalUrl" errors={state.fieldErrors} />
        </div>
        <div>
          <label htmlFor="externalHostName" className={labelClass}>
            Hosted by <span className="text-fg/50">(optional)</span>
          </label>
          <input
            id="externalHostName"
            name="externalHostName"
            maxLength={120}
            placeholder="Erie Beach Volleyball Club"
            className={inputClass}
            {...fieldA11y('externalHostName', state.fieldErrors)}
          />
          <FieldError name="externalHostName" errors={state.fieldErrors} />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-fg text-lg font-semibold">When</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="startsAt" className={labelClass}>
              Starts
            </label>
            <DateTimePicker
              name="startsAt"
              value={startsAt}
              onChange={setStartsAt}
              minDate={new Date()}
              inputClass={inputClass}
            />
            <FieldError name="startsAt" errors={state.fieldErrors} />
          </div>
          <div>
            <label htmlFor="endsAt" className={labelClass}>
              Ends <span className="text-fg/50">(optional)</span>
            </label>
            <DateTimePicker
              name="endsAt"
              value={endsAt}
              onChange={setEndsAt}
              minDate={startsAt ?? new Date()}
              inputClass={inputClass}
            />
            <FieldError name="endsAt" errors={state.fieldErrors} />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-fg text-lg font-semibold">
          Where <span className="text-fg/50 text-sm font-normal">(optional)</span>
        </legend>
        <p className="text-muted text-xs">
          Add a location if you know it — helps people in the area find this listing. Leave blank if
          the linked source doesn&rsquo;t list one.
        </p>
        <div>
          <label className={labelClass}>Search address</label>
          <AddressAutocomplete onPick={applySuggestion} inputClass={inputClass} />
        </div>
        <div>
          <label htmlFor="addressLine" className={labelClass}>
            Street <span className="text-fg/50">(optional)</span>
          </label>
          <input
            id="addressLine"
            name="addressLine"
            maxLength={200}
            value={addressLine}
            onChange={(e) => setAddressLine(e.target.value)}
            className={inputClass}
            {...fieldA11y('location.addressLine', state.fieldErrors)}
          />
          <FieldError name="location.addressLine" errors={state.fieldErrors} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="city" className={labelClass}>
              City
            </label>
            <input
              id="city"
              name="city"
              maxLength={100}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={inputClass}
              {...fieldA11y('location.city', state.fieldErrors)}
            />
            <FieldError name="location.city" errors={state.fieldErrors} />
          </div>
          <div>
            <label htmlFor="region" className={labelClass}>
              State / region <span className="text-fg/50">(optional)</span>
            </label>
            <input
              id="region"
              name="region"
              maxLength={100}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className={inputClass}
              {...fieldA11y('location.region', state.fieldErrors)}
            />
            <FieldError name="location.region" errors={state.fieldErrors} />
          </div>
          <div>
            <label htmlFor="postalCode" className={labelClass}>
              Postal code <span className="text-fg/50">(optional)</span>
            </label>
            <input
              id="postalCode"
              name="postalCode"
              maxLength={20}
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              className={inputClass}
              {...fieldA11y('location.postalCode', state.fieldErrors)}
            />
            <FieldError name="location.postalCode" errors={state.fieldErrors} />
          </div>
          <div>
            <label htmlFor="country" className={labelClass}>
              Country
            </label>
            <input
              id="country"
              name="country"
              maxLength={100}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className={inputClass}
              {...fieldA11y('location.country', state.fieldErrors)}
            />
            <FieldError name="location.country" errors={state.fieldErrors} />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-fg text-lg font-semibold">
          Details <span className="text-fg/50 text-sm font-normal">(optional)</span>
        </legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="surface" className={labelClass}>
              Surface
            </label>
            <select id="surface" name="surface" defaultValue="" className={inputClass}>
              <option value="">Any</option>
              <option value="indoor">Indoor</option>
              <option value="grass">Grass</option>
              <option value="sand">Sand</option>
            </select>
          </div>
          <div>
            <label htmlFor="format" className={labelClass}>
              Format
            </label>
            <select id="format" name="format" defaultValue="" className={inputClass}>
              <option value="">Any</option>
              <option value="sixes">Sixes</option>
              <option value="quads">Quads</option>
              <option value="triples">Triples</option>
              <option value="doubles">Doubles</option>
            </select>
          </div>
          <div>
            <label htmlFor="skillLevel" className={labelClass}>
              Skill
            </label>
            <select id="skillLevel" name="skillLevel" defaultValue="" className={inputClass}>
              <option value="">Any</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
              <option value="competitive">Competitive</option>
            </select>
          </div>
        </div>
      </fieldset>

      <div className="flex items-center justify-between gap-3">
        <Link href="/community" className="text-muted hover:text-primary text-sm">
          Cancel
        </Link>
        <SubmitButton />
      </div>
    </form>
  );
}
