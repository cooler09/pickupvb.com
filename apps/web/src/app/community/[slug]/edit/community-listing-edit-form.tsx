'use client';

import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import AddressAutocomplete, { type Suggestion } from '@/components/address-autocomplete';
import DateTimePicker from '@/components/datetime-picker';
import { editCommunityListingAction, type EditCommunityListingState } from './actions';

export type EditFormInitialValues = {
  id: string;
  slug: string;
  title: string;
  description: string;
  externalUrl: string;
  externalHostName: string | null;
  startsAt: Date;
  endsAt: Date | null;
  location: {
    addressLine: string | null;
    city: string;
    region: string | null;
    postalCode: string | null;
    country: string;
  } | null;
  surface: string | null;
  format: string | null;
  skillLevel: string | null;
};

const initialState: EditCommunityListingState = {};

const labelClass = 'block text-sm font-medium text-fg';
const inputClass =
  'mt-1 block w-full rounded-md border border-border-base bg-surface px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary';
const errorClass = 'mt-1 text-xs text-red-600';

function FieldError({
  name,
  errors,
}: {
  name: string;
  errors: Record<string, string> | undefined;
}) {
  const msg = errors?.[name];
  if (!msg) return null;
  return <p className={errorClass}>{msg}</p>;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-primary hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
    >
      {pending ? 'Saving…' : 'Save changes'}
    </button>
  );
}

export default function EditCommunityListingForm({ initial }: { initial: EditFormInitialValues }) {
  const boundAction = editCommunityListingAction.bind(null, initial.id, initial.slug);
  const [state, formAction] = useFormState(boundAction, initialState);
  const [addressLine, setAddressLine] = useState(initial.location?.addressLine ?? '');
  const [city, setCity] = useState(initial.location?.city ?? '');
  const [region, setRegion] = useState(initial.location?.region ?? '');
  const [postalCode, setPostalCode] = useState(initial.location?.postalCode ?? '');
  const [country, setCountry] = useState(initial.location?.country ?? '');
  const [startsAt, setStartsAt] = useState<Date | null>(initial.startsAt);
  const [endsAt, setEndsAt] = useState<Date | null>(initial.endsAt);

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
            defaultValue={initial.title}
            className={inputClass}
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
            defaultValue={initial.description}
            className={inputClass}
          />
          <FieldError name="description" errors={state.fieldErrors} />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-fg text-lg font-semibold">Where to RSVP</legend>
        <div>
          <label htmlFor="externalUrl" className={labelClass}>
            External URL
          </label>
          <input
            id="externalUrl"
            name="externalUrl"
            type="url"
            required
            defaultValue={initial.externalUrl}
            className={inputClass}
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
            defaultValue={initial.externalHostName ?? ''}
            className={inputClass}
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
              {...(startsAt ? { minDate: startsAt } : {})}
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
            <select
              id="surface"
              name="surface"
              defaultValue={initial.surface ?? ''}
              className={inputClass}
            >
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
            <select
              id="format"
              name="format"
              defaultValue={initial.format ?? ''}
              className={inputClass}
            >
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
            <select
              id="skillLevel"
              name="skillLevel"
              defaultValue={initial.skillLevel ?? ''}
              className={inputClass}
            >
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
        <Link href={`/community/${initial.slug}`} className="text-muted hover:text-primary text-sm">
          Cancel
        </Link>
        <SubmitButton />
      </div>
    </form>
  );
}
