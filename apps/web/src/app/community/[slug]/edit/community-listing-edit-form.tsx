'use client';

import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import AddressAutocomplete, { type Suggestion } from '@/components/address-autocomplete';
import DateTimePicker from '@/components/datetime-picker';
import { FieldError, fieldA11y } from '@/components/field-error';
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

const cardClass = 'border-border-base bg-surface space-y-5 rounded-lg border p-5 sm:p-6';
const labelClass = 'block text-sm font-medium text-fg';
const inputClass =
  'mt-1 block w-full rounded-md border border-border-base bg-surface px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-primary hover:bg-primary/90 inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
    >
      {pending ? 'Saving…' : 'Save changes'}
    </button>
  );
}

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="space-y-1">
      <h2 className="text-fg text-base font-semibold">{title}</h2>
      {description && <p className="text-muted text-xs">{description}</p>}
    </header>
  );
}

export default function EditCommunityListingForm({ initial }: { initial: EditFormInitialValues }) {
  const boundAction = editCommunityListingAction.bind(null, initial.id, initial.slug);
  const [state, formAction] = useFormState(boundAction, initialState);

  const initialAddress = initial.location?.addressLine ?? '';
  const initialCity = initial.location?.city ?? '';
  const initialRegion = initial.location?.region ?? '';
  const initialPostal = initial.location?.postalCode ?? '';
  const initialCountry = initial.location?.country ?? '';

  const [addressLine, setAddressLine] = useState(initialAddress);
  const [city, setCity] = useState(initialCity);
  const [region, setRegion] = useState(initialRegion);
  const [postalCode, setPostalCode] = useState(initialPostal);
  const [country, setCountry] = useState(initialCountry);
  const [startsAt, setStartsAt] = useState<Date | null>(initial.startsAt);
  const [endsAt, setEndsAt] = useState<Date | null>(initial.endsAt);
  const hasInitialLocation = Boolean(
    initialAddress || initialCity || initialRegion || initialPostal || initialCountry,
  );
  const [addressOpen, setAddressOpen] = useState(hasInitialLocation);

  function applySuggestion(s: Suggestion) {
    setAddressLine(s.addressLine);
    setCity(s.city);
    setRegion(s.region);
    setPostalCode(s.postalCode);
    if (s.country) setCountry(s.country);
    setAddressOpen(true);
  }

  return (
    <form action={formAction} className="space-y-6 pb-24 sm:pb-0">
      {state.error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {state.error}
        </div>
      )}

      <section className={cardClass}>
        <SectionHeader title="Basics" />
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
            defaultValue={initial.description}
            className={inputClass}
            {...fieldA11y('description', state.fieldErrors)}
          />
          <FieldError name="description" errors={state.fieldErrors} />
        </div>
      </section>

      <section className={cardClass}>
        <SectionHeader
          title="Where to RSVP"
          description="Players will be linked off-site to sign up."
        />
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
            defaultValue={initial.externalHostName ?? ''}
            className={inputClass}
            {...fieldA11y('externalHostName', state.fieldErrors)}
          />
          <FieldError name="externalHostName" errors={state.fieldErrors} />
        </div>
      </section>

      <section className={cardClass}>
        <SectionHeader title="When & where" />
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

        <div className="space-y-3">
          <label className={labelClass}>
            Search address <span className="text-fg/50">(optional)</span>
          </label>
          <AddressAutocomplete onPick={applySuggestion} inputClass={inputClass} />
          <input
            name="addressLine"
            type="text"
            maxLength={200}
            value={addressLine}
            onChange={(e) => setAddressLine(e.target.value)}
            placeholder="Street address"
            className={inputClass}
            {...fieldA11y('location.addressLine', state.fieldErrors)}
          />
          <FieldError name="location.addressLine" errors={state.fieldErrors} />
          {!addressOpen ? (
            <button
              type="button"
              onClick={() => setAddressOpen(true)}
              className="text-primary text-xs font-medium hover:underline"
            >
              Add city, state, postal, country
            </button>
          ) : (
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
          )}
        </div>
      </section>

      <section className={cardClass}>
        <SectionHeader
          title="Details"
          description="Optional tags to help players filter community listings."
        />
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
      </section>

      <div className="border-border-base bg-surface/95 fixed inset-x-0 bottom-0 z-10 flex items-center justify-between gap-3 border-t p-4 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <Link href={`/community/${initial.slug}`} className="text-muted hover:text-primary text-sm">
          Cancel
        </Link>
        <SubmitButton />
      </div>
    </form>
  );
}
