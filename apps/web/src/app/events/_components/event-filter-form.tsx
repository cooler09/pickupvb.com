'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import {
  SURFACE_LABEL,
  TYPE_LABEL,
  SKILL_LABEL,
  AGE_GROUP_LABEL,
  TEAM_COMPOSITION_LABEL,
} from '@/lib/enum-labels';
import { primaryButtonClass } from '@/components/primary-button';
import {
  SURFACES,
  TYPES,
  SKILLS,
  AGE_GROUPS,
  TEAM_COMPOSITIONS,
  type Surface,
  type Type,
  type Skill,
  type AgeGroupFilter,
  type TeamCompositionFilter,
} from './event-filter-options';

type Props = {
  when: 'upcoming' | 'past' | 'following';
  surface: Surface | undefined;
  type: Type | undefined;
  skillBand: Skill | undefined;
  ageGroup: AgeGroupFilter | undefined;
  teamComposition: TeamCompositionFilter | undefined;
  seriesName: string | undefined;
  /** When set, renders hidden lat/lng inputs and a Radius (km) field. */
  location: { lat: number; lng: number; radiusKm: number } | null;
};

// eslint-disable-next-line no-restricted-syntax -- compact filter-bar select, not a labeled form field (persona-ux.md CC-2 exception)
const selectClass =
  'mt-1 w-full rounded-md border border-border-base bg-surface px-2 py-1.5 text-sm';
// eslint-disable-next-line no-restricted-syntax -- uppercase filter-bar label, distinct from form field labels (persona-ux.md CC-2 exception)
const labelClass = 'text-muted block text-xs font-semibold tracking-wide uppercase';

/**
 * GET form for filtering the events list. Submits back to /events with the
 * chosen filters (and radius when a location is active). The current `when`
 * tab is preserved via a hidden field so applying filters doesn't drop the
 * user back into Upcoming.
 *
 * Layout: the three most-used filters (surface / type / skill) sit on a single
 * row; less-used filters (age, team, series, radius) live behind a "More
 * filters" toggle — open by default if any of them are active.
 */
export function EventFilterForm({
  when,
  surface,
  type,
  skillBand,
  ageGroup,
  teamComposition,
  seriesName,
  location,
}: Props) {
  const advancedActive = Boolean(ageGroup || teamComposition || seriesName || location);
  const router = useRouter();
  const [pending, start] = useTransition();

  // Auto-apply: navigate as soon as a control changes, so filtering feels
  // instant (matching the Near-me button). The form keeps `method="get"` and
  // the Apply button so it still works with JS disabled. Rebuilding the query
  // from FormData drops `page` (resetting pagination) and preserves the hidden
  // `when` / `lat` / `lng` fields.
  const apply = (form: HTMLFormElement) => {
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form).entries()) {
      const v = String(value).trim();
      if (v) params.set(key, v);
    }
    const q = params.toString();
    start(() => router.push((q ? `/events?${q}` : '/events') as Route));
  };

  return (
    <form
      method="get"
      onChange={(e) => apply(e.currentTarget)}
      onSubmit={(e) => {
        e.preventDefault();
        apply(e.currentTarget);
      }}
      className={`border-border-base bg-surface rounded-shape-sm space-y-3 border p-4 transition-opacity ${
        pending ? 'opacity-60' : ''
      }`}
    >
      {when !== 'upcoming' && <input type="hidden" name="when" value={when} />}
      {location && (
        <>
          <input type="hidden" name="lat" value={String(location.lat)} />
          <input type="hidden" name="lng" value={String(location.lng)} />
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className={labelClass}>Surface</span>
          <select name="surface" defaultValue={surface ?? ''} className={selectClass}>
            <option value="">Any</option>
            {SURFACES.map((s) => (
              <option key={s} value={s}>
                {SURFACE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className={labelClass}>Type</span>
          <select name="type" defaultValue={type ?? ''} className={selectClass}>
            <option value="">Any</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className={labelClass}>Skill</span>
          <select name="skillBand" defaultValue={skillBand ?? ''} className={selectClass}>
            <option value="">Any</option>
            {SKILLS.map((s) => (
              <option key={s} value={s}>
                {SKILL_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <details className="group" {...(advancedActive ? { open: true } : {})}>
        <summary className="text-primary hover:bg-fg/5 flex w-fit cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-xs font-medium select-none">
          <span className="group-open:hidden">More filters</span>
          <span className="hidden group-open:inline">Fewer filters</span>
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-3 w-3 transition-transform group-open:rotate-180"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">
            <span className={labelClass}>Age group</span>
            <select name="ageGroup" defaultValue={ageGroup ?? ''} className={selectClass}>
              <option value="">Any</option>
              {AGE_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {AGE_GROUP_LABEL[g]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className={labelClass}>Team format</span>
            <select
              name="teamComposition"
              defaultValue={teamComposition ?? ''}
              className={selectClass}
            >
              <option value="">Any</option>
              {TEAM_COMPOSITIONS.map((c) => (
                <option key={c} value={c}>
                  {TEAM_COMPOSITION_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className={labelClass}>Series</span>
            <input
              name="seriesName"
              type="text"
              placeholder="e.g. Grass Masters"
              defaultValue={seriesName ?? ''}
              maxLength={120}
              className={selectClass}
            />
          </label>
          {location && (
            <label className="text-sm">
              <span className={labelClass}>Radius (km)</span>
              <input
                name="radiusKm"
                type="number"
                min={1}
                max={500}
                defaultValue={location.radiusKm}
                className={selectClass}
              />
            </label>
          )}
        </div>
      </details>

      <div className="flex justify-end">
        <button type="submit" className={primaryButtonClass('md')}>
          Apply filters
        </button>
      </div>
    </form>
  );
}
