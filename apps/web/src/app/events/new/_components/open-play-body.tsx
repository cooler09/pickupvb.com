'use client';

/**
 * Open-play branch of the create-event form (architecture audit P3-1):
 * surface + skill tier, the capacity selector (unlimited / fixed / by-position
 * roster), and the "sign me up too" toggle.
 */
import type { Dispatch, SetStateAction } from 'react';
import { EVENT_POSITIONS, EventPosition } from '@pickupvb/domain';
import { FieldError, fieldA11y } from '@/components/field-error';
import { POSITION_LABEL } from '@/lib/enum-labels';
import {
  chk,
  inputClass,
  labelClass,
  SegmentedControl,
  SkillTierSelect,
  val,
  type CapacityKind,
} from './form-primitives';

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
          <div className="border-border-base mt-3 space-y-3 rounded-md border border-dashed p-3">
            <p className="text-muted text-xs">
              Set a target count for each indoor 6&apos;s position. Players over a position&apos;s
              count get a <span className="italic">waitlist</span> badge.
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
            <FieldError name="positionRoster" errors={fieldErrors} />
          </div>
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
