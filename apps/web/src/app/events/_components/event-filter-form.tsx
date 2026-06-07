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
  PRICES,
  PRICE_FILTER_LABEL,
  SORTS,
  SORT_LABEL,
  type Surface,
  type Type,
  type Skill,
  type AgeGroupFilter,
  type TeamCompositionFilter,
  type PriceFilter,
  type SortOption,
} from './event-filter-options';

export type EventFilterFormProps = {
  when: 'upcoming' | 'past' | 'following';
  surface: Surface | undefined;
  type: Type | undefined;
  skillBand: Skill | undefined;
  ageGroup: AgeGroupFilter | undefined;
  teamComposition: TeamCompositionFilter | undefined;
  seriesName: string | undefined;
  /** Free / Paid filter (applied in-memory; works on every tab). */
  price: PriceFilter | undefined;
  /**
   * Result ordering. Absence = the per-tab date order. "Nearest" is only
   * offered when a location is active; the whole control is hidden on Following.
   */
  sort: SortOption | undefined;
  /** When set, renders hidden lat/lng inputs and a Radius (km) field. */
  location: { lat: number; lng: number; radiusKm: number } | null;
};

// eslint-disable-next-line no-restricted-syntax -- compact filter-bar select, not a labeled form field (persona-ux.md CC-2 exception)
const selectClass =
  'mt-1 w-full rounded-md border border-border-base bg-md-surface-container px-2 py-1.5 text-sm';
// eslint-disable-next-line no-restricted-syntax -- uppercase filter-bar label, distinct from form field labels (persona-ux.md CC-2 exception)
const labelClass = 'text-muted block text-xs font-semibold tracking-wide uppercase';

/**
 * GET form for filtering the events list. Submits back to /events with the
 * chosen filters (and radius when a location is active). The current `when`
 * tab is preserved via a hidden field so applying filters doesn't drop the
 * user back into Upcoming.
 *
 * Layout: the most-used filters (surface / type / skill / price) sit on a
 * single row; less-used filters (age, team, series, radius) live behind a
 * "More filters" toggle — open by default if any of them are active.
 */
export function EventFilterForm({
  when,
  surface,
  type,
  skillBand,
  ageGroup,
  teamComposition,
  seriesName,
  price,
  sort,
  location,
}: EventFilterFormProps) {
  const advancedActive = Boolean(ageGroup || teamComposition || seriesName);
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
      className={`border-border-base bg-md-surface-container rounded-shape-sm space-y-3 border p-4 transition-opacity ${
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        <label className="text-sm">
          <span className={labelClass}>Price</span>
          <select name="price" defaultValue={price ?? ''} className={selectClass}>
            <option value="">Any</option>
            {PRICES.map((p) => (
              <option key={p} value={p}>
                {PRICE_FILTER_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Radius is a primary control once a location is active (set via the
          Near-me button or the City/ZIP search) — not buried under "More
          filters" — since it's the main knob for widening/narrowing results. */}
      {location && (
        <label className="block text-sm sm:max-w-48">
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
        </div>
      </details>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {when === 'following' ? (
          <span />
        ) : (
          <label className="flex items-center gap-2 text-sm">
            <span className={labelClass}>Sort</span>
            <select
              name="sort"
              defaultValue={sort ?? ''}
              className="border-border-base bg-md-surface-container rounded-md border px-2 py-1.5 text-sm"
            >
              <option value="">Date</option>
              {/* "Nearest" needs distances, which only exist with a location. */}
              {location && <option value="distance">{SORT_LABEL.distance}</option>}
              {SORTS.filter((s) => s !== 'distance').map((s) => (
                <option key={s} value={s}>
                  {SORT_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" className={primaryButtonClass('md')}>
          Apply filters
        </button>
      </div>
    </form>
  );
}
