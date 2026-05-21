'use client';

/**
 * Repeater UI for the per-division block of the create-event form.
 *
 * Per ADR 0006, every event is composed of one or more divisions. For
 * tournaments the form requires at least one (pass `requireAtLeastOne`);
 * open-play and other surfaces may keep it optional and use the legacy
 * top-level fields to synthesize a default division server-side.
 *
 * Each row submits its fields under indexed names `div_${i}_label`,
 * `div_${i}_surface`, … so the server action can rebuild the array.
 */

import { useState } from 'react';

type Row = {
  // Stable client key; never sent to the server.
  key: number;
  label: string;
  surface: string;
  format: string;
  gender: string;
  skillTier: string;
  ageGroup: string;
  teamComposition: string;
  teamSize: string;
  capacityKind: 'unlimited' | 'fixed';
  maxSpots: string;
  priceUsd: string;
  prizeText: string;
};

const blankRow = (key: number, defaults?: Partial<Row>): Row => ({
  key,
  label: '',
  surface: 'indoor',
  format: 'sixes',
  gender: 'coed',
  skillTier: 'bb',
  ageGroup: 'adult',
  teamComposition: 'solo',
  teamSize: '',
  capacityKind: 'unlimited',
  maxSpots: '',
  priceUsd: '',
  prizeText: '',
  ...defaults,
});

const labelClass = 'block text-xs font-medium text-fg';
const inputClass =
  'mt-1 block w-full rounded-md border border-border-base bg-surface px-2 py-1.5 text-sm shadow-sm focus:border-primary focus:outline-none';

export default function DivisionsRepeater({
  defaultSurface,
  requireAtLeastOne = false,
}: {
  defaultSurface?: string;
  /** When true, always render at least one row and hide its Remove button. */
  requireAtLeastOne?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    requireAtLeastOne ? [blankRow(0, { surface: defaultSurface ?? 'indoor' })] : [],
  );
  const [nextKey, setNextKey] = useState(requireAtLeastOne ? 1 : 1);

  function add() {
    setRows((r) => [...r, blankRow(nextKey, { surface: defaultSurface ?? 'indoor' })]);
    setNextKey((k) => k + 1);
  }
  function remove(key: number) {
    setRows((r) => (requireAtLeastOne && r.length <= 1 ? r : r.filter((row) => row.key !== key)));
  }
  function patch(key: number, patch: Partial<Row>) {
    setRows((r) => r.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  return (
    <fieldset className="border-border-base space-y-3 rounded-md border p-4">
      <legend className="text-fg px-1 text-sm font-semibold">
        {requireAtLeastOne ? (
          'Divisions'
        ) : (
          <>
            Additional divisions <span className="text-muted font-normal">(optional)</span>
          </>
        )}
      </legend>
      <p className="text-muted text-xs">
        {requireAtLeastOne
          ? "Add a row for each division you're running (e.g. Men's A, Women's BB, Coed Quads). Each division has its own skill tier, capacity, and entry price."
          : "Running a multi-format or multi-skill tournament? Add a row for each extra division (e.g. Men's A, Women's BB, Coed Quads). The fields above define your first division."}
      </p>

      {rows.map((row, idx) => (
        <div
          key={row.key}
          className="border-border-base bg-highlight/20 space-y-2 rounded-md border border-dashed p-3"
        >
          <input type="hidden" name={`div_${idx}_present`} value="1" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted text-xs font-semibold tracking-wide uppercase">
              Division {requireAtLeastOne ? idx + 1 : idx + 2}
            </span>
            {!(requireAtLeastOne && rows.length <= 1) && (
              <button
                type="button"
                onClick={() => remove(row.key)}
                className="text-xs text-red-600 hover:underline"
              >
                Remove
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass}>Label</label>
              <input
                required
                name={`div_${idx}_label`}
                value={row.label}
                onChange={(e) => patch(row.key, { label: e.target.value })}
                maxLength={60}
                placeholder="e.g. Women's BB"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Surface</label>
              <select
                name={`div_${idx}_surface`}
                value={row.surface}
                onChange={(e) => patch(row.key, { surface: e.target.value })}
                className={inputClass}
              >
                <option value="indoor">Indoor</option>
                <option value="grass">Grass</option>
                <option value="sand">Sand</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Format</label>
              <select
                name={`div_${idx}_format`}
                value={row.format}
                onChange={(e) => patch(row.key, { format: e.target.value })}
                className={inputClass}
              >
                <option value="sixes">Sixes</option>
                <option value="quads">Quads</option>
                <option value="triples">Triples</option>
                <option value="doubles">Doubles</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Gender</label>
              <select
                name={`div_${idx}_gender`}
                value={row.gender}
                onChange={(e) => patch(row.key, { gender: e.target.value })}
                className={inputClass}
              >
                <option value="coed">Coed</option>
                <option value="mens">Men&apos;s</option>
                <option value="womens">Women&apos;s</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Skill tier</label>
              <select
                name={`div_${idx}_skillTier`}
                value={row.skillTier}
                onChange={(e) => patch(row.key, { skillTier: e.target.value })}
                className={inputClass}
              >
                <option value="c">C</option>
                <option value="b">B</option>
                <option value="bb">BB</option>
                <option value="bb3">BB-3</option>
                <option value="a">A</option>
                <option value="aa">AA</option>
                <option value="open">Open</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Age group</label>
              <select
                name={`div_${idx}_ageGroup`}
                value={row.ageGroup}
                onChange={(e) => patch(row.key, { ageGroup: e.target.value })}
                className={inputClass}
              >
                <option value="adult">Adult</option>
                <option value="hs">High school</option>
                <option value="18u">18-under</option>
                <option value="16u">16-under</option>
                <option value="14u">14-under</option>
                <option value="jr_high">Jr. high</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Team composition</label>
              <select
                name={`div_${idx}_teamComposition`}
                value={row.teamComposition}
                onChange={(e) => patch(row.key, { teamComposition: e.target.value })}
                className={inputClass}
              >
                <option value="solo">Solo signup</option>
                <option value="team">Pre-formed team</option>
                <option value="pair_draw">Pair draw</option>
                <option value="partner_required">Partner required</option>
              </select>
            </div>
            {(row.teamComposition === 'pair_draw' ||
              row.teamComposition === 'partner_required' ||
              row.teamComposition === 'team') && (
              <div>
                <label className={labelClass}>Team size</label>
                <input
                  type="number"
                  min={1}
                  max={24}
                  name={`div_${idx}_teamSize`}
                  value={row.teamSize}
                  onChange={(e) => patch(row.key, { teamSize: e.target.value })}
                  className={inputClass}
                />
              </div>
            )}
            <div>
              <label className={labelClass}>Capacity</label>
              <select
                name={`div_${idx}_capacityKind`}
                value={row.capacityKind}
                onChange={(e) =>
                  patch(row.key, { capacityKind: e.target.value as 'unlimited' | 'fixed' })
                }
                className={inputClass}
              >
                <option value="unlimited">Unlimited</option>
                <option value="fixed">Fixed teams</option>
              </select>
            </div>
            {row.capacityKind === 'fixed' && (
              <div>
                <label className={labelClass}>Max teams</label>
                <input
                  type="number"
                  min={1}
                  name={`div_${idx}_maxSpots`}
                  value={row.maxSpots}
                  onChange={(e) => patch(row.key, { maxSpots: e.target.value })}
                  className={inputClass}
                />
              </div>
            )}
            <div>
              <label className={labelClass}>Entry price (USD)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                name={`div_${idx}_priceUsd`}
                value={row.priceUsd}
                onChange={(e) => patch(row.key, { priceUsd: e.target.value })}
                placeholder="0"
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Prize (text)</label>
              <input
                name={`div_${idx}_prizeText`}
                value={row.prizeText}
                onChange={(e) => patch(row.key, { prizeText: e.target.value })}
                maxLength={500}
                placeholder="e.g. $300 / team or Champion T-shirts"
                className={inputClass}
              />
            </div>
          </div>
        </div>
      ))}

      <div>
        <button
          type="button"
          onClick={add}
          className="border-border-base bg-surface text-fg hover:bg-highlight/40 rounded-md border px-3 py-1.5 text-sm font-medium"
        >
          + Add another division
        </button>
      </div>

      {/* Tell the server how many rows are present. */}
      <input type="hidden" name="div_count" value={rows.length} />
    </fieldset>
  );
}
