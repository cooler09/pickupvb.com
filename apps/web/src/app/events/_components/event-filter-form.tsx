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
export const TEAM_COMPOSITIONS = ['solo', 'team', 'pair_draw', 'partner_required'] as const;

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

/**
 * GET form for filtering the events list. Submits back to /events with the
 * chosen filters (and radius when a location is active). The current `when`
 * tab is preserved via a hidden field so applying filters doesn't drop the
 * user back into Upcoming.
 *
 * Division-aware filters (skill band, age group, team composition, series
 * name) match events that have at least one division satisfying the
 * combined predicate — see `search_events` RPC.
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
    return (
        <form
            method="get"
            className="grid gap-3 rounded-lg border border-border-base bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3"
        >
            {when !== 'upcoming' && <input type="hidden" name="when" value={when} />}
            <label className="text-sm">
                <span className="block text-xs font-semibold uppercase tracking-wide text-muted">
                    Surface
                </span>
                <select
                    name="surface"
                    defaultValue={surface ?? ''}
                    className="mt-1 w-full rounded-md border border-border-base px-2 py-1.5"
                >
                    <option value="">Any</option>
                    {SURFACES.map((s) => (
                        <option key={s} value={s}>
                            {SURFACE_LABEL[s]}
                        </option>
                    ))}
                </select>
            </label>
            <label className="text-sm">
                <span className="block text-xs font-semibold uppercase tracking-wide text-muted">
                    Type
                </span>
                <select
                    name="type"
                    defaultValue={type ?? ''}
                    className="mt-1 w-full rounded-md border border-border-base px-2 py-1.5"
                >
                    <option value="">Any</option>
                    {TYPES.map((t) => (
                        <option key={t} value={t}>
                            {TYPE_LABEL[t]}
                        </option>
                    ))}
                </select>
            </label>
            <label className="text-sm">
                <span className="block text-xs font-semibold uppercase tracking-wide text-muted">
                    Skill band
                </span>
                <select
                    name="skillBand"
                    defaultValue={skillBand ?? ''}
                    className="mt-1 w-full rounded-md border border-border-base px-2 py-1.5"
                >
                    <option value="">Any</option>
                    {SKILLS.map((s) => (
                        <option key={s} value={s}>
                            {SKILL_LABEL[s]}
                        </option>
                    ))}
                </select>
            </label>
            <label className="text-sm">
                <span className="block text-xs font-semibold uppercase tracking-wide text-muted">
                    Age group
                </span>
                <select
                    name="ageGroup"
                    defaultValue={ageGroup ?? ''}
                    className="mt-1 w-full rounded-md border border-border-base px-2 py-1.5"
                >
                    <option value="">Any</option>
                    {AGE_GROUPS.map((g) => (
                        <option key={g} value={g}>
                            {AGE_GROUP_LABEL[g]}
                        </option>
                    ))}
                </select>
            </label>
            <label className="text-sm">
                <span className="block text-xs font-semibold uppercase tracking-wide text-muted">
                    Team format
                </span>
                <select
                    name="teamComposition"
                    defaultValue={teamComposition ?? ''}
                    className="mt-1 w-full rounded-md border border-border-base px-2 py-1.5"
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
                <span className="block text-xs font-semibold uppercase tracking-wide text-muted">
                    Series
                </span>
                <input
                    name="seriesName"
                    type="text"
                    placeholder="e.g. Grass Masters"
                    defaultValue={seriesName ?? ''}
                    maxLength={120}
                    className="mt-1 w-full rounded-md border border-border-base px-2 py-1.5"
                />
            </label>
            <div className="flex items-end sm:col-span-2 lg:col-span-3">
                <button
                    type="submit"
                    className="h-[34px] rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90"
                >
                    Apply
                </button>
            </div>
            {location && (
                <>
                    <input type="hidden" name="lat" value={String(location.lat)} />
                    <input type="hidden" name="lng" value={String(location.lng)} />
                    <label className="text-sm">
                        <span className="block text-xs font-semibold uppercase tracking-wide text-muted">
                            Radius (km)
                        </span>
                        <input
                            name="radiusKm"
                            type="number"
                            min={1}
                            max={500}
                            defaultValue={location.radiusKm}
                            className="mt-1 w-full rounded-md border border-border-base px-2 py-1.5"
                        />
                    </label>
                </>
            )}
        </form>
    );
}
