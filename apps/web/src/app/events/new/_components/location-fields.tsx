'use client';

/**
 * Shared address/location fieldset for the create + edit event forms
 * (architecture audit P3-1 — DRY the duplicated location block). The 5 address
 * values + their setters live in the parent form (the autocomplete fills them,
 * the user can edit), so this is a purely presentational block driven by props.
 *
 * Parameterized over the two real differences between the new + edit forms:
 *   - `errorPrefix` — the create form namespaces field errors `location.*`
 *     (matching its `createEventAction`), the edit form uses the bare key.
 *     `fieldA11y`/`FieldError` slots are inert when no matching error exists,
 *     so rendering all five on both forms is safe.
 *   - `collapsible` — the create form collapses city/region/postal/country
 *     behind an "Edit address details" toggle once an address is present; the
 *     edit form always shows them.
 *   - `searchHelp` — optional helper line under the autocomplete (create only).
 */
import AddressAutocomplete, { type Suggestion } from '@/components/address-autocomplete';
import { FieldError, fieldA11y } from '@/components/field-error';
import { inputClass, labelClass } from './form-primitives';

export default function LocationFields({
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
  fieldErrors,
  errorPrefix = '',
  collapsible = false,
  addressOpen = false,
  setAddressOpen,
  searchHelp,
}: {
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
  fieldErrors: Record<string, string> | undefined;
  /** Prefix for field-error keys: `''` (edit) or `'location.'` (create). */
  errorPrefix?: string;
  /** Collapse city/region/postal/country behind a toggle once filled (create). */
  collapsible?: boolean;
  addressOpen?: boolean;
  setAddressOpen?: (v: boolean) => void;
  /** Optional helper line under the address search (create only). */
  searchHelp?: string;
}) {
  const hasAddress = addressLine.trim().length > 0;
  const expanded = !collapsible || addressOpen || !hasAddress;
  const key = (field: string) => `${errorPrefix}${field}`;

  return (
    <>
      <div>
        <label htmlFor="addressSearch" className={labelClass}>
          Search address or venue
        </label>
        <AddressAutocomplete onPick={onPick} inputClass={inputClass} />
        {searchHelp ? <p className="text-muted mt-1 text-xs">{searchHelp}</p> : null}
      </div>

      {/* Always render the address line; the rest collapse until needed. */}
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
          placeholder="123 Main St"
          className={inputClass}
          {...fieldA11y(key('addressLine'), fieldErrors)}
        />
        <FieldError name={key('addressLine')} errors={fieldErrors} />
      </div>

      {collapsible && hasAddress && !addressOpen ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <p className="text-muted">
            {[city, region, postalCode, country].filter(Boolean).join(', ') || (
              <span className="italic">Add city / region details</span>
            )}
          </p>
          <button
            type="button"
            onClick={() => setAddressOpen?.(true)}
            className="text-primary hover:underline"
          >
            Edit address details
          </button>
        </div>
      ) : null}

      {expanded && (
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
              {...fieldA11y(key('city'), fieldErrors)}
            />
            <FieldError name={key('city')} errors={fieldErrors} />
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
              {...fieldA11y(key('region'), fieldErrors)}
            />
            <FieldError name={key('region')} errors={fieldErrors} />
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
              {...fieldA11y(key('postalCode'), fieldErrors)}
            />
            <FieldError name={key('postalCode')} errors={fieldErrors} />
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
              {...fieldA11y(key('country'), fieldErrors)}
            />
            <FieldError name={key('country')} errors={fieldErrors} />
          </div>
        </div>
      )}
    </>
  );
}
