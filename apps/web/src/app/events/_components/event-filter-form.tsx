import {
  SURFACE_LABEL,
  TYPE_LABEL,
  SKILL_LABEL,
  AGE_GROUP_LABEL,
  TEAM_COMPOSITION_LABEL,
} from '@/lib/enum-labels';

export const SURFACES = ['indoor', 'grass', 'sand'] as const;
export const TYPES = ['open_play', 'tournament'] as const;
export const SKILLS = ['beginner', 'intermediate', 'advanced', 'competitive'] as const;
export const AGE_GROUPS = ['adult', 'hs', '18u', '16u', '14u', 'jr_high'] as const;
export const TEAM_COMPOSITIONS = ['solo', 'team', 'pair_draw', 'partners'] as const;

export type Surface = (typeof SURFACES)[number];
export type Type = (typeof TYPES)[number];
export type Skill = (typeof SKILLS)[number];
export type AgeGroupFilter = (typeof AGE_GROUPS)[number];
export type TeamCompositionFilter = (typeof TEAM_COMPOSITIONS)[number];

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

const selectClass =
  'mt-1 w-full rounded-md border border-border-base bg-surface px-2 py-1.5 text-sm';
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

  return (
    <form
      method="get"
      className="border-border-base bg-surface rounded-shape-sm space-y-3 border p-4"
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
        <button
          type="submit"
          className="bg-primary hover:bg-primary/90 rounded-md px-4 py-1.5 text-sm font-semibold text-white"
        >
          Apply filters
        </button>
      </div>
    </form>
  );
}
