'use client';

/**
 * Section 3 of the create-event form (architecture audit P3-1): start/end times
 * + the location block. The address fields come from the shared
 * {@link LocationFields} (also used by the edit form); the controlled address +
 * datetime state lives in the parent form.
 */
import type { Suggestion } from '@/components/address-autocomplete';
import DateTimePicker from '@/components/datetime-picker';
import { FieldError } from '@/components/field-error';
import { cardClass, cardSubClass, cardTitleClass, inputClass, labelClass } from './form-primitives';
import LocationFields from './location-fields';

export default function WhenWhereSection({
  startsAt,
  setStartsAt,
  endsAt,
  setEndsAt,
  addressLine,
  setAddressLine,
  city,
  setCity,
  region,
  setRegion,
  postalCode,
  setPostalCode,
  country,
  setCountry,
  onPick,
  addressOpen,
  setAddressOpen,
  fieldErrors,
}: {
  startsAt: Date | null;
  setStartsAt: (v: Date | null) => void;
  endsAt: Date | null;
  setEndsAt: (v: Date | null) => void;
  addressLine: string;
  setAddressLine: (v: string) => void;
  city: string;
  setCity: (v: string) => void;
  region: string;
  setRegion: (v: string) => void;
  postalCode: string;
  setPostalCode: (v: string) => void;
  country: string;
  setCountry: (v: string) => void;
  onPick: (s: Suggestion) => void;
  addressOpen: boolean;
  setAddressOpen: (v: boolean) => void;
  fieldErrors: Record<string, string> | undefined;
}) {
  return (
    <section className={cardClass}>
      <div>
        <h2 className={cardTitleClass}>When &amp; where</h2>
        <p className={cardSubClass}>Times and location. Address is geocoded on submit.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="startsAt" className={labelClass}>
            Starts at
          </label>
          <DateTimePicker
            name="startsAt"
            value={startsAt}
            onChange={setStartsAt}
            minDate={new Date()}
            inputClass={inputClass}
          />
          <FieldError name="startsAt" errors={fieldErrors} />
        </div>
        <div>
          <label htmlFor="endsAt" className={labelClass}>
            Ends at
          </label>
          <DateTimePicker
            name="endsAt"
            value={endsAt}
            onChange={setEndsAt}
            minDate={startsAt ?? new Date()}
            inputClass={inputClass}
          />
          <FieldError name="endsAt" errors={fieldErrors} />
        </div>
      </div>

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
        onPick={onPick}
        fieldErrors={fieldErrors}
        errorPrefix="location."
        collapsible
        addressOpen={addressOpen}
        setAddressOpen={setAddressOpen}
        searchHelp="Pick a result to fill the fields below. You can edit them anytime."
      />
    </section>
  );
}
