'use client';

/**
 * Open-play branch of the create-event form (architecture audit P3-1):
 * surface + skill tier, the capacity selector (unlimited / fixed / by-position
 * roster), and the "sign me up too" toggle.
 */
import { useState, type Dispatch, type SetStateAction } from 'react';
import { EventPosition, Format, isFormatAllowedForSurface, type Surface } from '@pickupvb/domain';
import { FORMAT_LABEL } from '@/lib/enum-labels';
import { FieldError, fieldA11y } from '@/components/field-error';
import {
  chk,
  inputClass,
  labelClass,
  PositionRosterGrid,
  SegmentedControl,
  SkillTierSelect,
  val,
  type CapacityKind,
} from './form-primitives';

/** Format chips in display order; the first selected drives the primary division. */
const FORMAT_OPTIONS: ReadonlyArray<Format> = [
  Format.Sixes,
  Format.Quads,
  Format.Triples,
  Format.Doubles,
];

export default function OpenPlayBody({
  capacityKind,
  setCapacityKind,
  byPosition,
  positionCounts,
  setPositionCounts,
  positionTotal,
  fieldErrors,
  values,
  submitted,
}: {
  capacityKind: CapacityKind;
  setCapacityKind: (k: CapacityKind) => void;
  byPosition: boolean;
  positionCounts: Record<EventPosition, number>;
  setPositionCounts: Dispatch<SetStateAction<Record<EventPosition, number>>>;
  positionTotal: number;
  fieldErrors: Record<string, string> | undefined;
  values: Record<string, string> | undefined;
  submitted: boolean | undefined;
}) {
  // Surface is controlled so the format options can react to it (indoor allows
  // only sixes/quads). Formats are a controlled set — picking 2+ advertises a
  // multi-format session; the first (in FORMAT_OPTIONS order) drives the single
  // division. Disabled (surface-illegal) boxes don't submit, and switching to a
  // stricter surface prunes any now-illegal selection.
  const [surface, setSurface] = useState<Surface>(
    () => val(values, 'surface', 'indoor') as Surface,
  );
  const [formats, setFormats] = useState<Set<Format>>(() => {
    const init = new Set<Format>();
    for (const f of FORMAT_OPTIONS) if (chk(values, submitted, `format_${f}`, false)) init.add(f);
    return init;
  });

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="surface" className={labelClass}>
            Surface
          </label>
          <select
            id="surface"
            name="surface"
            value={surface}
            onChange={(e) => {
              const next = e.target.value as Surface;
              setSurface(next);
              setFormats(
                (prev) => new Set([...prev].filter((f) => isFormatAllowedForSurface(next, f))),
              );
            }}
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
      </div>

      <div>
        <p className={labelClass}>Format(s)</p>
        <p className="text-muted text-xs">
          Pick one, or several if you run more than one at once (e.g. 4s and 6s courts).
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {FORMAT_OPTIONS.map((f) => {
            const allowed = isFormatAllowedForSurface(surface, f);
            const checked = formats.has(f);
            return (
              <label
                key={f}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm ${
                  allowed
                    ? 'border-border-base hover:bg-fg/5 cursor-pointer'
                    : 'border-border-base/50 text-muted cursor-not-allowed opacity-50'
                } ${checked ? 'border-primary bg-primary/10 text-primary' : ''}`}
              >
                <input
                  type="checkbox"
                  name={`format_${f}`}
                  checked={checked}
                  disabled={!allowed}
                  onChange={(e) =>
                    setFormats((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(f);
                      else next.delete(f);
                      return next;
                    })
                  }
                  className="sr-only"
                />
                {FORMAT_LABEL[f] ?? f}
              </label>
            );
          })}
        </div>
        <FieldError name="formats" errors={fieldErrors} />
      </div>

      <div>
        <p className={labelClass}>How many spots?</p>
        <div className="mt-2">
          <SegmentedControl<CapacityKind>
            value={capacityKind}
            ariaLabel="Capacity mode"
            onChange={setCapacityKind}
            options={[
              { value: 'unlimited', label: 'Unlimited' },
              { value: 'fixed', label: 'Fixed spots' },
              { value: 'by_position', label: 'By position' },
            ]}
          />
        </div>

        {capacityKind === 'fixed' && (
          <div className="mt-3 max-w-xs">
            <label htmlFor="maxSpots" className={labelClass}>
              Max spots
            </label>
            <input
              id="maxSpots"
              name="maxSpots"
              type="number"
              min={1}
              defaultValue={val(values, 'maxSpots')}
              className={inputClass}
              {...fieldA11y('capacity', fieldErrors)}
            />
            <FieldError name="capacity" errors={fieldErrors} />
          </div>
        )}

        {byPosition && (
          <PositionRosterGrid
            positionCounts={positionCounts}
            setPositionCounts={setPositionCounts}
            positionTotal={positionTotal}
            fieldErrors={fieldErrors}
          />
        )}
      </div>

      <label className="bg-highlight/40 flex items-start gap-2 rounded-md p-3 text-sm">
        <input
          type="checkbox"
          name="joinAsHost"
          defaultChecked={chk(values, submitted, 'joinAsHost', true)}
          className="mt-0.5"
        />
        <span>
          <span className="text-fg font-medium">Sign me up as a player too</span>
          <span className="text-muted block text-xs">
            Adds you to the attendee list. You can leave any time.
            {byPosition && " You'll pick a position from the event page."}
          </span>
        </span>
      </label>
    </>
  );
}
