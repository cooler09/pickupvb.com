'use client';

/**
 * Shared building blocks for the create/edit event forms (architecture audit
 * P3-1 — decompose `new-event-form.tsx`). Style tokens, the `val`/`chk`
 * form-value helpers, and the small presentational controls (`SkillTierSelect`,
 * `SubmitButton`, `TypeCard`, `SegmentedControl`) live here so both
 * `new-event-form.tsx` and the section components import one copy — and so
 * `edit-event-form.tsx` (same form shape) can reuse them too (the DRY note in
 * the audit).
 */
import { useFormStatus } from 'react-dom';
import { EventType } from '@pickupvb/domain';
import { FieldError, fieldA11y } from '@/components/field-error';
import { primaryButtonClass } from '@/components/primary-button';
import { fieldInputClass, fieldLabelClass } from '@/components/field-styles';

export type CapacityKind = 'unlimited' | 'fixed' | 'by_position';

// Re-exported from the shared field recipe (persona-ux.md CC-2) so the
// create/edit-event sections that import `inputClass`/`labelClass` from here
// stay on the one canonical vocabulary.
export const labelClass = fieldLabelClass;
export const inputClass = fieldInputClass;
export const cardClass =
  'border-border-base bg-surface space-y-5 rounded-shape-sm border p-5 sm:p-6';
export const cardTitleClass = 'text-fg text-base font-semibold';
export const cardSubClass = 'text-muted text-sm';

/** Lookup a previously-submitted form value (echoed back on action error).
 *  Falls back to the `1_`-prefixed variant so templates saved under the old
 *  useFormState slot encoding still apply correctly. */
export function val(
  values: Record<string, string> | undefined,
  name: string,
  fallback = '',
): string {
  return values?.[name] ?? values?.[`1_${name}`] ?? fallback;
}

export function chk(
  values: Record<string, string> | undefined,
  submitted: boolean | undefined,
  name: string,
  fallback = false,
): boolean {
  if (values && Object.prototype.hasOwnProperty.call(values, name)) {
    return values[name] === 'on';
  }
  if (!submitted) return fallback;
  return values?.[name] === 'on';
}

// Renders the SkillTier ladder used by every division (incl. the implicit
// division #1 that the top-level form represents). Grouped by SkillBand so
// the labels still line up with the legacy band buckets.
export function SkillTierSelect({
  fieldErrors,
  values,
}: {
  fieldErrors: Record<string, string> | undefined;
  values: Record<string, string> | undefined;
}) {
  return (
    <div>
      <label htmlFor="skillTier" className={labelClass}>
        Skill tier
      </label>
      <select
        id="skillTier"
        name="skillTier"
        defaultValue={val(values, 'skillTier', 'bb')}
        className={inputClass}
        {...fieldA11y('skillLevel', fieldErrors)}
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
      <FieldError name="skillLevel" errors={fieldErrors} />
    </div>
  );
}

export function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={primaryButtonClass('md')}>
      {pending ? 'Creating…' : 'Create event'}
    </button>
  );
}

export function TypeCard({
  value,
  current,
  title,
  description,
  onChange,
}: {
  value: EventType;
  current: EventType;
  title: string;
  description: string;
  onChange: (v: EventType) => void;
}) {
  const checked = value === current;
  return (
    <label
      className={`rounded-shape-sm block cursor-pointer border p-4 transition-colors ${
        checked
          ? 'border-primary bg-primary/5 ring-primary/30 ring-2'
          : 'border-border-base hover:bg-fg/5'
      }`}
    >
      <input
        type="radio"
        name="type"
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="sr-only"
      />
      <div className="text-fg text-sm font-semibold">{title}</div>
      <div className="text-muted mt-1 text-xs">{description}</div>
    </label>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="border-border-base bg-fg/5 inline-flex flex-wrap rounded-md border p-0.5 text-sm"
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`rounded px-3 py-1.5 transition-colors ${
              active ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
