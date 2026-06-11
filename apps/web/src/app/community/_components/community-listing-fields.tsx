'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import AddressAutocomplete, { type Suggestion } from '@/components/address-autocomplete';
import DateTimePicker from '@/components/datetime-picker';
import { FieldError, fieldA11y } from '@/components/field-error';
import { primaryButtonClass } from '@/components/primary-button';
import {
  fieldInputClass as inputClass,
  fieldLabelClass as labelClass,
} from '@/components/field-styles';

/**
 * Initial values for the shared community-listing form body. Omitted entirely on
 * the **submit** form (empty fields); supplied on the **edit** form.
 */
export type CommunityListingFieldValues = {
  title: string;
  description: string;
  externalUrl: string;
  externalHostName: string | null;
  startsAt: Date | null;
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

const cardClass =
  'border-border-base bg-md-surface-container space-y-5 rounded-shape-sm border p-5 sm:p-6';

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="space-y-1">
      <h2 className="text-fg text-base font-semibold">{title}</h2>
      {description && <p className="text-muted text-xs">{description}</p>}
    </header>
  );
}

/**
 * The full field body shared by the community-listing **submit** and **edit**
 * forms (audit CU-5) — Basics, Where-to-RSVP, When & where (with
 * address-autocomplete + progressive-disclosure of the city/region/postal/
 * country block), and the optional Details tags. The two forms previously
 * duplicated ~250 lines of this JSX and had drifted; this is the edit form's
 * (more polished) layout, now used by both.
 *
 * Uncontrolled inputs read from `initial` via `defaultValue`; the address +
 * date fields are controlled so the autocomplete + pickers can write them.
 */
export function CommunityListingFields({
  fieldErrors,
  initial,
  floorStartToToday = false,
}: {
  fieldErrors?: Record<string, string> | undefined;
  initial?: CommunityListingFieldValues | undefined;
  /** Block selecting a start before today (submit flow); edit allows past edits. */
  floorStartToToday?: boolean;
}) {
  // Lazy init → one stable "now" for the lifetime of the form, computed off the
  // render path (AGENTS pattern #4 — no `new Date()` in a render body).
  const [today] = useState<Date>(() => new Date());

  const [addressLine, setAddressLine] = useState(initial?.location?.addressLine ?? '');
  const [city, setCity] = useState(initial?.location?.city ?? '');
  const [region, setRegion] = useState(initial?.location?.region ?? '');
  const [postalCode, setPostalCode] = useState(initial?.location?.postalCode ?? '');
  const [country, setCountry] = useState(initial?.location?.country ?? '');
  const [startsAt, setStartsAt] = useState<Date | null>(initial?.startsAt ?? null);
  const [endsAt, setEndsAt] = useState<Date | null>(initial?.endsAt ?? null);
  const hasInitialLocation = Boolean(addressLine || city || region || postalCode || country);
  const [addressOpen, setAddressOpen] = useState(hasInitialLocation);

  const startMin = floorStartToToday ? today : null;
  const endsMin = startsAt ?? startMin;

  function applySuggestion(s: Suggestion) {
    setAddressLine(s.addressLine);
    setCity(s.city);
    setRegion(s.region);
    setPostalCode(s.postalCode);
    if (s.country) setCountry(s.country);
    setAddressOpen(true);
  }

  return (
    <>
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
            defaultValue={initial?.title ?? ''}
            placeholder="Saturday morning beach league"
            className={inputClass}
            {...fieldA11y('title', fieldErrors)}
          />
          <FieldError name="title" errors={fieldErrors} />
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
            defaultValue={initial?.description ?? ''}
            placeholder="What's the format, cost, what to bring, etc."
            className={inputClass}
            {...fieldA11y('description', fieldErrors)}
          />
          <FieldError name="description" errors={fieldErrors} />
        </div>
      </section>

      <section className={cardClass}>
        <SectionHeader
          title="Where to RSVP"
          description="Players are linked off-site to sign up — a Facebook event, Meetup, Eventbrite, etc. Must start with https:// and not be a pickupvb.com URL."
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
            defaultValue={initial?.externalUrl ?? ''}
            placeholder="https://www.facebook.com/events/..."
            className={inputClass}
            {...fieldA11y('externalUrl', fieldErrors)}
          />
          <FieldError name="externalUrl" errors={fieldErrors} />
        </div>
        <div>
          <label htmlFor="externalHostName" className={labelClass}>
            Hosted by <span className="text-fg/50">(optional)</span>
          </label>
          <input
            id="externalHostName"
            name="externalHostName"
            maxLength={120}
            defaultValue={initial?.externalHostName ?? ''}
            placeholder="Erie Beach Volleyball Club"
            className={inputClass}
            {...fieldA11y('externalHostName', fieldErrors)}
          />
          <FieldError name="externalHostName" errors={fieldErrors} />
        </div>
      </section>

      <section className={cardClass}>
        <SectionHeader
          title="When & where"
          description="Add a location if you know it — it helps nearby players find this listing."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="startsAt" className={labelClass}>
              Starts
            </label>
            <DateTimePicker
              name="startsAt"
              value={startsAt}
              onChange={setStartsAt}
              {...(startMin ? { minDate: startMin } : {})}
              inputClass={inputClass}
            />
            <FieldError name="startsAt" errors={fieldErrors} />
          </div>
          <div>
            <label htmlFor="endsAt" className={labelClass}>
              Ends <span className="text-fg/50">(optional)</span>
            </label>
            <DateTimePicker
              name="endsAt"
              value={endsAt}
              onChange={setEndsAt}
              {...(endsMin ? { minDate: endsMin } : {})}
              inputClass={inputClass}
            />
            <FieldError name="endsAt" errors={fieldErrors} />
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
            {...fieldA11y('location.addressLine', fieldErrors)}
          />
          <FieldError name="location.addressLine" errors={fieldErrors} />
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
                  {...fieldA11y('location.city', fieldErrors)}
                />
                <FieldError name="location.city" errors={fieldErrors} />
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
                  {...fieldA11y('location.region', fieldErrors)}
                />
                <FieldError name="location.region" errors={fieldErrors} />
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
                  {...fieldA11y('location.postalCode', fieldErrors)}
                />
                <FieldError name="location.postalCode" errors={fieldErrors} />
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
                  {...fieldA11y('location.country', fieldErrors)}
                />
                <FieldError name="location.country" errors={fieldErrors} />
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
              defaultValue={initial?.surface ?? ''}
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
              defaultValue={initial?.format ?? ''}
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
              defaultValue={initial?.skillLevel ?? ''}
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
    </>
  );
}

/**
 * Sticky (mobile) / inline (desktop) Cancel + Submit footer shared by both
 * community-listing forms. Reads `useFormStatus` for the pending label, so it
 * must render inside the `<form>`.
 */
export function CommunityListingFormFooter({
  cancelHref,
  submitLabel,
  pendingLabel,
}: {
  cancelHref: Route;
  submitLabel: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <div className="border-border-base bg-md-surface-container/95 fixed inset-x-0 bottom-0 z-10 flex items-center justify-between gap-3 border-t p-4 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
      <Link href={cancelHref} className="text-muted hover:text-primary text-sm">
        Cancel
      </Link>
      <button type="submit" disabled={pending} className={primaryButtonClass('md')}>
        {pending ? pendingLabel : submitLabel}
      </button>
    </div>
  );
}
