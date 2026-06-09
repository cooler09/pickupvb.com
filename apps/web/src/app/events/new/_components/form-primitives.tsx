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
import { useRef, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react';
import { useFormStatus } from 'react-dom';
import { EVENT_POSITIONS, EventPosition, EventType } from '@pickupvb/domain';
import { FieldError, fieldA11y } from '@/components/field-error';
import { POSITION_LABEL } from '@/lib/enum-labels';
import { primaryButtonClass } from '@/components/primary-button';
import { fieldInputClass, fieldLabelClass } from '@/components/field-styles';

export type CapacityKind = 'unlimited' | 'fixed' | 'by_position';

// Re-exported from the shared field recipe (persona-ux.md CC-2) so the
// create/edit-event sections that import `inputClass`/`labelClass` from here
// stay on the one canonical vocabulary.
export const labelClass = fieldLabelClass;
export const inputClass = fieldInputClass;
export const cardClass =
  'border-border-base bg-md-surface-container space-y-5 rounded-shape-sm border p-5 sm:p-6';
export const cardTitleClass = 'text-fg text-base font-semibold';
export const cardSubClass = 'text-muted text-sm';

/**
 * Visual required-field marker (CE-12). Native inputs carry the `required`
 * attribute (which conveys requiredness to assistive tech), so this asterisk is
 * decorative reinforcement and is hidden from AT to avoid a double-announce.
 */
export function RequiredMark() {
  return (
    <span className="text-md-error ml-0.5" aria-hidden="true">
      *
    </span>
  );
}

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

// The SkillTier ladder, grouped by SkillBand so the labels line up with the
// legacy band buckets. Shared by the open-play `SkillTierSelect` and the
// per-division select in the divisions repeater so both show the same grouping
// (CE-8).
export function SkillTierOptions() {
  return (
    <>
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
    </>
  );
}

// Renders the SkillTier ladder used by every division (incl. the implicit
// division #1 that the top-level form represents).
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
        <SkillTierOptions />
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
      className={`rounded-shape-sm has-focus-visible:ring-primary/70 block cursor-pointer border p-4 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-offset-1 ${
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

/** Sensible defaults for indoor 6's when a host first switches to a by-position
 *  roster: 1 setter, 2 outsides, 1 opposite, 2 middles, 1 libero. Shared by the
 *  create + edit forms so they seed the same starting grid. */
export const DEFAULT_POSITION_ROSTER: Record<EventPosition, number> = {
  [EventPosition.Setter]: 1,
  [EventPosition.Outside]: 2,
  [EventPosition.Opposite]: 1,
  [EventPosition.Middle]: 2,
  [EventPosition.Libero]: 1,
  [EventPosition.DefensiveSpecialist]: 0,
};

/**
 * Per-position target-count grid for a by-position open-play roster. Submits
 * `position_${pos}` number inputs the server reads. Shared by the create
 * (`OpenPlayBody`) and edit forms so they stay in lockstep (CE-11). Pass
 * `fieldErrors` only where the server surfaces a `positionRoster` error (create).
 */
export function PositionRosterGrid({
  positionCounts,
  setPositionCounts,
  positionTotal,
  fieldErrors,
}: {
  positionCounts: Record<EventPosition, number>;
  setPositionCounts: Dispatch<SetStateAction<Record<EventPosition, number>>>;
  positionTotal: number;
  fieldErrors?: Record<string, string> | undefined;
}) {
  return (
    <div className="border-border-base mt-3 space-y-3 rounded-md border border-dashed p-3">
      <p className="text-muted text-xs">
        Set a target count for each indoor 6&apos;s position. Players over a position&apos;s count
        get a <span className="italic">waitlist</span> badge.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {EVENT_POSITIONS.map((pos) => (
          <div key={pos}>
            <label htmlFor={`pos-${pos}`} className="text-fg block text-xs font-medium">
              {POSITION_LABEL[pos] ?? pos}
            </label>
            <input
              id={`pos-${pos}`}
              name={`position_${pos}`}
              type="number"
              min={0}
              max={50}
              value={positionCounts[pos]}
              onChange={(e) =>
                setPositionCounts((c) => ({
                  ...c,
                  [pos]: Math.max(0, Number(e.target.value) || 0),
                }))
              }
              className={inputClass}
            />
          </div>
        ))}
      </div>
      <p className="text-muted text-xs">
        Total: <span className="text-fg font-semibold">{positionTotal}</span> spots
      </p>
      {fieldErrors ? <FieldError name="positionRoster" errors={fieldErrors} /> : null}
    </div>
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
  // ARIA radiogroup keyboard model (CE-4): only the checked option is in the tab
  // order (roving tabindex); Arrow / Home / End move selection *and* focus among
  // the options. Without this, the `role="radiogroup"` we announce is a lie —
  // every option was tabbable and arrows did nothing.
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = options.findIndex((o) => o.value === value);
  // When the value matches no option, the first option is the tabbable one.
  const tabbableIndex = activeIndex >= 0 ? activeIndex : 0;

  function selectAndFocus(index: number) {
    const next = options[index];
    if (!next) return;
    onChange(next.value);
    // The buttons never unmount, so focusing the existing node synchronously is
    // safe even though onChange schedules a re-render.
    btnRefs.current[index]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const count = options.length;
    if (count === 0) return;
    const current = activeIndex >= 0 ? activeIndex : 0;
    let nextIndex: number;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (current + 1) % count;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (current - 1 + count) % count;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = count - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    selectAndFocus(nextIndex);
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className="border-border-base bg-fg/5 inline-flex flex-wrap rounded-md border p-0.5 text-sm"
    >
      {options.map((opt, i) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={i === tabbableIndex ? 0 : -1}
            onClick={() => onChange(opt.value)}
            className={`focus-visible:ring-primary rounded px-3 py-1.5 transition-colors focus:outline-none focus-visible:ring-2 ${
              active ? 'bg-md-surface-container text-fg shadow-sm' : 'text-muted hover:text-fg'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
