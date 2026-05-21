'use client';

/**
 * Host-only CRUD for event divisions (ADR 0006).
 *
 * Renders the current divisions in collapsed cards (label + summary) with
 * an "Edit" toggle that expands an inline form. A separate "+ Add division"
 * disclosure at the bottom opens a blank form. Forms post to the server
 * actions in `division-actions.ts`. Delete uses a confirmation prompt.
 *
 * This is intentionally a single-row-at-a-time UI rather than a bulk
 * editor — most events have ≤ 4 divisions and the inline form mirrors the
 * field set already used on the create-event repeater for consistency.
 */

import { useState } from 'react';
import type { DivisionLite } from '@pickupvb/domain';
import { SubmitButton } from '@/components/submit-button';
import { addDivisionFromForm, updateDivisionFromForm, removeDivision } from '../division-actions';

type Props = {
  eventId: string;
  returnPath: string;
  divisions: ReadonlyArray<DivisionLite>;
};

const labelClass = 'block text-xs font-medium text-fg';
const inputClass =
  'mt-1 block w-full rounded-md border border-border-base bg-surface px-2 py-1.5 text-sm shadow-sm focus:border-primary focus:outline-none';

function DivisionForm({
  initial,
  action,
  onCancel,
  submitLabel,
}: {
  initial?: Partial<DivisionLite>;
  action: (formData: FormData) => void | Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [capacityKind, setCapacityKind] = useState<'unlimited' | 'fixed'>(
    initial?.capacityKind === 'fixed' ? 'fixed' : 'unlimited',
  );
  const [teamComposition, setTeamComposition] = useState<string>(
    initial?.teamComposition ?? 'solo',
  );
  const needsTeamSize =
    teamComposition === 'team' ||
    teamComposition === 'pair_draw' ||
    teamComposition === 'partner_required';
  return (
    <form action={action} className="space-y-3">
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
            <option value="partner_required">Bring partner(s)</option>
          </select>
        </div>
        {needsTeamSize && (
          <div>
            <label className={labelClass}>Team size</label>
            <input
              type="number"
              name="teamSize"
              min={1}
              max={24}
              defaultValue={initial?.teamSize ?? ''}
              className={inputClass}
            />
          </div>
        )}
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
            defaultValue={initial?.priceCents != null ? (initial.priceCents / 100).toFixed(2) : ''}
            placeholder="0.00"
            className={inputClass}
          />
        </div>
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
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="border-border-base rounded-md border px-3 py-1.5 text-sm"
        >
          Cancel
        </button>
        <SubmitButton className="bg-primary text-primary-fg rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}

export function HostDivisionsManager({ eventId, returnPath, divisions }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function handleRemove(divisionId: string) {
    if (!window.confirm('Remove this division? Sign-ups in this division will be unrouted.'))
      return;
    await removeDivision(eventId, divisionId, returnPath);
  }

  return (
    <section className="border-border-base bg-fg/[0.02] space-y-3 rounded-lg border p-4">
      <header className="flex items-center justify-between">
        <h2 className="text-fg text-base font-semibold">Manage divisions</h2>
        <span className="text-muted text-xs">{divisions.length} total</span>
      </header>

      <ul className="space-y-2">
        {divisions.map((d) => (
          <li key={d.id} className="border-border-base bg-surface rounded-md border p-3">
            {editingId === d.id ? (
              <DivisionForm
                initial={d}
                action={updateDivisionFromForm.bind(null, eventId, d.id, returnPath)}
                onCancel={() => setEditingId(null)}
                submitLabel="Save changes"
              />
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span className="text-fg text-sm font-medium">{d.label}</span>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setEditingId(d.id)}
                    className="text-primary hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(d.id)}
                    className="text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="border-border-base bg-surface rounded-md border border-dashed p-3">
          <DivisionForm
            action={async (fd) => {
              await addDivisionFromForm(eventId, returnPath, fd);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
            submitLabel="Add division"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-primary text-sm hover:underline"
        >
          + Add division
        </button>
      )}
    </section>
  );
}
