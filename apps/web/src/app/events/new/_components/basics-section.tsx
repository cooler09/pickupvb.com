'use client';

/**
 * Section 2 of the create-event form (architecture audit P3-1): title,
 * description, and the "host as group" picker. Pure presentational block driven
 * by the echoed-back `values` + `fieldErrors`.
 */
import { FieldError, fieldA11y } from '@/components/field-error';
import {
  cardClass,
  cardSubClass,
  cardTitleClass,
  inputClass,
  labelClass,
  val,
} from './form-primitives';

export default function BasicsSection({
  fieldErrors,
  values,
  hostableGroups,
}: {
  fieldErrors: Record<string, string> | undefined;
  values: Record<string, string> | undefined;
  hostableGroups: { id: string; name: string }[];
}) {
  return (
    <section className={cardClass}>
      <div>
        <h2 className={cardTitleClass}>Basics</h2>
        <p className={cardSubClass}>Title and a quick description for the event card.</p>
      </div>
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
          defaultValue={val(values, 'title')}
          placeholder="Tuesday night open gym"
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
          rows={3}
          maxLength={4000}
          defaultValue={val(values, 'description')}
          placeholder="Indoor 6's, all levels welcome. Bring kneepads — we'll rotate teams every set."
          className={inputClass}
          {...fieldA11y('description', fieldErrors)}
        />
        <FieldError name="description" errors={fieldErrors} />
      </div>
      <div>
        <label htmlFor="hostGroupId" className={labelClass}>
          Host as
        </label>
        <select
          id="hostGroupId"
          name="hostGroupId"
          defaultValue={val(values, 'hostGroupId', '')}
          className={inputClass}
        >
          <option value="">Yourself</option>
          {hostableGroups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <p className="text-muted mt-1 text-xs">
          Hosting on behalf of a group? Pick any group you own or admin.
        </p>
      </div>
    </section>
  );
}
