'use client';

/**
 * External-registration branch of the create-event form (architecture audit
 * P3-1): surface + skill (+ format/gender for tournaments), the off-platform
 * registration URL, and instructions. No on-platform pricing/capacity here —
 * those are handled by the external source.
 */
import { EventType } from '@pickupvb/domain';
import { FieldError, fieldA11y } from '@/components/field-error';
import { inputClass, labelClass, SkillTierSelect, val } from './form-primitives';

export default function ExternalFields({
  type,
  fieldErrors,
  values,
}: {
  type: EventType;
  fieldErrors: Record<string, string> | undefined;
  values: Record<string, string> | undefined;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="surface" className={labelClass}>
            Surface
          </label>
          <select
            id="surface"
            name="surface"
            defaultValue={val(values, 'surface', 'indoor')}
            className={inputClass}
            {...fieldA11y('surface', fieldErrors)}
          >
            <option value="indoor">Indoor</option>
            <option value="grass">Grass</option>
            <option value="sand">Sand</option>
          </select>
          <FieldError name="surface" errors={fieldErrors} />
        </div>
        <SkillTierSelect fieldErrors={fieldErrors} values={values} />
        {type === EventType.Tournament && (
          <>
            <div>
              <label htmlFor="format" className={labelClass}>
                Format
              </label>
              <select
                id="format"
                name="format"
                defaultValue={val(values, 'format', 'sixes')}
                className={inputClass}
                {...fieldA11y('format', fieldErrors)}
              >
                <option value="sixes">Sixes</option>
                <option value="quads">Quads</option>
                <option value="triples">Triples</option>
                <option value="doubles">Doubles</option>
              </select>
              <FieldError name="format" errors={fieldErrors} />
            </div>
            <div>
              <label htmlFor="gender" className={labelClass}>
                Gender
              </label>
              <select
                id="gender"
                name="gender"
                defaultValue={val(values, 'gender', 'coed')}
                className={inputClass}
                {...fieldA11y('gender', fieldErrors)}
              >
                <option value="coed">Coed</option>
                <option value="mens">Men&apos;s</option>
                <option value="womens">Women&apos;s</option>
              </select>
              <FieldError name="gender" errors={fieldErrors} />
            </div>
          </>
        )}
      </div>
      <div>
        <label htmlFor="externalRegistrationUrl" className={labelClass}>
          Registration URL
        </label>
        <input
          id="externalRegistrationUrl"
          name="externalRegistrationUrl"
          type="url"
          maxLength={2048}
          defaultValue={val(values, 'externalRegistrationUrl')}
          placeholder="https://…"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="externalRegistrationInstructions" className={labelClass}>
          Instructions <span className="text-fg/50">(optional)</span>
        </label>
        <textarea
          id="externalRegistrationInstructions"
          name="externalRegistrationInstructions"
          rows={2}
          maxLength={2000}
          defaultValue={val(values, 'externalRegistrationInstructions')}
          placeholder="e.g. Register via AES by Friday. Bring photo ID to check-in."
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="paymentInstructions" className={labelClass}>
          Payment instructions <span className="text-fg/50">(optional)</span>
        </label>
        <textarea
          id="paymentInstructions"
          name="paymentInstructions"
          rows={2}
          maxLength={2000}
          defaultValue={val(values, 'paymentInstructions')}
          placeholder="e.g. Venmo @league-org or pay at check-in (cash/card)."
          className={inputClass}
        />
      </div>
    </div>
  );
}
