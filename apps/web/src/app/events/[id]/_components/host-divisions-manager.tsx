'use client';

/**
 * Host-only CRUD for event divisions (ADR 0006).
 *
 * Renders the current divisions as collapsed rows (label + Edit / Remove).
 * "Edit" and the section-level "+ Add division" each open the same
 * `DivisionForm` inside a `FormModal` (persona-ux.md CC-5/H-2 — the inline
 * 16-field expand used to shove the page around; a focused subtask belongs in
 * a modal, matching the walk-in team form). Forms post to the server actions
 * in `division-actions.ts`; the modal closes itself via `CloseOnSettled` when
 * the action settles. Remove uses the in-app `ConfirmSubmitButton` dialog.
 *
 * This is intentionally a single-row-at-a-time UI rather than a bulk
 * editor — most events have ≤ 4 divisions and the form mirrors the field set
 * already used on the create-event repeater for consistency.
 */

import { useState } from 'react';
import type { DivisionLite } from '@pickupvb/domain';
import { SubmitButton } from '@/components/submit-button';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';
import { CloseOnSettled, FormModal, ModalActions } from '@/components/form-modal';
import {
  errorTextButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/primary-button';
import {
  fieldInputClass as inputClass,
  fieldLabelClass as labelClass,
} from '@/components/field-styles';
import { addDivisionFromForm, updateDivisionFromForm, removeDivision } from '../division-actions';

type Props = {
  eventId: string;
  returnPath: string;
  divisions: ReadonlyArray<DivisionLite>;
};

function DivisionForm({
  initial,
  action,
  close,
  submitLabel,
}: {
  initial?: Partial<DivisionLite>;
  action: (formData: FormData) => void | Promise<void>;
  close: () => void;
  submitLabel: string;
}) {
  const [capacityKind, setCapacityKind] = useState<'unlimited' | 'fixed'>(
    initial?.capacityKind === 'fixed' ? 'fixed' : 'unlimited',
  );
  const [teamComposition, setTeamComposition] = useState<string>(
    initial?.teamComposition ?? 'solo',
  );
  const [priceUsd, setPriceUsd] = useState<string>(
    initial?.priceCents != null ? (initial.priceCents / 100).toFixed(2) : '',
  );
  return (
    <form action={action} className="space-y-3">
      <CloseOnSettled onSettled={close} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelClass}>Label</label>
          <input
            required
            name="label"
            defaultValue={initial?.label ?? ''}
            maxLength={60}
            placeholder="e.g. Women's BB"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Surface</label>
          <select name="surface" defaultValue={initial?.surface ?? 'indoor'} className={inputClass}>
            <option value="indoor">Indoor</option>
            <option value="grass">Grass</option>
            <option value="sand">Sand</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Format</label>
          <select name="format" defaultValue={initial?.format ?? 'sixes'} className={inputClass}>
            <option value="sixes">Sixes</option>
            <option value="quads">Quads</option>
            <option value="triples">Triples</option>
            <option value="doubles">Doubles</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Gender</label>
          <select name="gender" defaultValue={initial?.gender ?? 'coed'} className={inputClass}>
            <option value="coed">Coed</option>
            <option value="mens">Men&apos;s</option>
            <option value="womens">Women&apos;s</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Skill tier</label>
          <select name="skillTier" defaultValue={initial?.skillTier ?? 'bb'} className={inputClass}>
            <option value="c">C</option>
            <option value="b">B</option>
            <option value="bb">BB</option>
            <option value="bb3">BB3</option>
            <option value="a">A</option>
            <option value="aa">AA</option>
            <option value="open">Open</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Age group</label>
          <select
            name="ageGroup"
            defaultValue={initial?.ageGroup ?? 'adult'}
            className={inputClass}
          >
            <option value="adult">Adult</option>
            <option value="hs">High school</option>
            <option value="18u">18U</option>
            <option value="16u">16U</option>
            <option value="14u">14U</option>
            <option value="jr_high">Junior high</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Team composition</label>
          <select
            name="teamComposition"
            value={teamComposition}
            onChange={(e) => setTeamComposition(e.target.value)}
            className={inputClass}
          >
            <option value="solo">Individual signup</option>
            <option value="team">Pre-formed team</option>
            <option value="pair_draw">Pair draw</option>
            <option value="partners">Bring partner(s)</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Capacity</label>
          <select
            name="capacityKind"
            value={capacityKind}
            onChange={(e) => setCapacityKind(e.target.value as 'unlimited' | 'fixed')}
            className={inputClass}
          >
            <option value="unlimited">Unlimited</option>
            <option value="fixed">Fixed</option>
          </select>
        </div>
        {capacityKind === 'fixed' && (
          <div>
            <label className={labelClass}>Max spots</label>
            <input
              type="number"
              name="maxSpots"
              min={1}
              defaultValue={initial?.maxSpots ?? ''}
              className={inputClass}
            />
          </div>
        )}
        <div>
          <label className={labelClass}>Price (USD)</label>
          <input
            type="number"
            name="priceUsd"
            min={0}
            step="0.01"
            value={priceUsd}
            onChange={(e) => setPriceUsd(e.target.value)}
            placeholder="0.00"
            className={inputClass}
          />
        </div>
        {/* ADR 0012 — price-unit only matters when the division charges
            money. Free divisions are normalized server-side to the unit
            implied by the team-registration mode. */}
        {Number(priceUsd) > 0 && (
          <div>
            <label className={labelClass}>Charge</label>
            <select
              name="priceUnit"
              defaultValue={initial?.priceUnit ?? 'per_player'}
              className={inputClass}
            >
              <option value="per_player">Per player</option>
              <option value="per_team">Per team</option>
            </select>
          </div>
        )}
        <div className="sm:col-span-2">
          <label className={labelClass}>Prize</label>
          <input
            name="prizeText"
            maxLength={500}
            defaultValue={initial?.prizeText ?? ''}
            placeholder="e.g. Cash prize for top 3"
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-fg flex items-center gap-2 text-xs font-medium">
            <input
              type="checkbox"
              name="allowFreeAgents"
              value="1"
              defaultChecked={initial?.allowFreeAgents ?? true}
            />
            Accept free-agent signups for this division
          </label>
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Team registration</label>
          <select
            name="teamRegistrationMode"
            defaultValue={initial?.teamRegistrationMode ?? 'none'}
            className={inputClass}
          >
            <option value="ad_hoc">Ad-hoc — captain assembles at signup</option>
            <option value="roster">Roster — captain picks an existing team</option>
            <option value="none">None — individual signups</option>
          </select>
          <p className="text-muted mt-1 text-xs">
            Per ADR 0016 each division opts in independently. Solo-composition divisions should stay
            on “None”.
          </p>
        </div>
      </div>
      <ModalActions
        dismissive={
          <button type="button" onClick={close} className={secondaryButtonClass('md')}>
            Cancel
          </button>
        }
        confirming={
          <SubmitButton className={primaryButtonClass('md')} pendingChildren="Saving…">
            {submitLabel}
          </SubmitButton>
        }
      />
    </form>
  );
}

export function HostDivisionsManager({ eventId, returnPath, divisions }: Props) {
  return (
    <section className="border-border-base bg-fg/[0.02] rounded-shape-sm space-y-3 border p-4">
      <header className="flex items-center justify-between">
        <h2 className="text-fg text-base font-semibold">Manage divisions</h2>
        <span className="text-muted text-xs">{divisions.length} total</span>
      </header>

      <ul className="space-y-2">
        {divisions.map((d) => (
          <li
            key={d.id}
            className="border-border-base bg-surface flex items-center justify-between gap-2 rounded-md border p-3"
          >
            <span className="text-fg min-w-0 truncate text-sm font-medium">{d.label}</span>
            <div className="flex shrink-0 items-center gap-1">
              <FormModal
                trigger={(open) => (
                  <button
                    type="button"
                    onClick={open}
                    className={`${secondaryButtonClass('sm')} tap-target`}
                  >
                    Edit
                  </button>
                )}
                title={`Edit ${d.label}`}
                description="Update this division's format, capacity, pricing, and registration mode."
                size="lg"
              >
                {(close) => (
                  <DivisionForm
                    initial={d}
                    action={updateDivisionFromForm.bind(null, eventId, d.id, returnPath)}
                    close={close}
                    submitLabel="Save changes"
                  />
                )}
              </FormModal>
              {/* Demoted relative to Edit (no border/fill); the canonical
                  text-error variant keeps the destructive red on the M3 token.
                  `tap-target` keeps it ≥44px in the dense row. */}
              <form
                action={removeDivision.bind(null, eventId, d.id, returnPath)}
                className="contents"
              >
                <ConfirmSubmitButton
                  label="Remove"
                  pendingLabel="Removing…"
                  confirmTitle="Remove division"
                  confirmMessage="Remove this division? Sign-ups in this division will be unrouted."
                  confirmLabel="Remove division"
                  destructive
                  className={`${errorTextButtonClass('sm')} tap-target`}
                />
              </form>
            </div>
          </li>
        ))}
      </ul>

      <FormModal
        trigger={(open) => (
          <button type="button" onClick={open} className={secondaryButtonClass('md')}>
            + Add division
          </button>
        )}
        title="Add division"
        description="Add another division to this event. It mirrors the fields on the create-event form."
        size="lg"
      >
        {(close) => (
          <DivisionForm
            action={addDivisionFromForm.bind(null, eventId, returnPath)}
            close={close}
            submitLabel="Add division"
          />
        )}
      </FormModal>
    </section>
  );
}
