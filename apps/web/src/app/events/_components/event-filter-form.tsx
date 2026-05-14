import { SURFACE_LABEL, TYPE_LABEL, SKILL_LABEL } from '@/lib/enum-labels';

export const SURFACES = ['indoor', 'grass', 'sand'] as const;
export const TYPES = ['open_play', 'tournament'] as const;
export const SKILLS = ['beginner', 'intermediate', 'advanced', 'competitive'] as const;

export type Surface = (typeof SURFACES)[number];
export type Type = (typeof TYPES)[number];
export type Skill = (typeof SKILLS)[number];

type Props = {
    when: 'upcoming' | 'past' | 'following';
    surface: Surface | undefined;
    type: Type | undefined;
    skillLevel: Skill | undefined;
    /** When set, renders hidden lat/lng inputs and a Radius (km) field. */
    location: { lat: number; lng: number; radiusKm: number } | null;
};

/**
 * GET form for filtering the events list. Submits back to /events with the
 * chosen surface/type/skill (and radius when a location is active). The
 * current `when` tab is preserved via a hidden field so applying filters
 * doesn't drop the user back into Upcoming.
 */
export function EventFilterForm({ when, surface, type, skillLevel, location }: Props) {
    return (
        <form
            method="get"
            className="grid gap-3 rounded-lg border border-border-base bg-surface p-4 sm:grid-cols-[1fr_1fr_1fr_auto]"
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
                    Skill
                </span>
                <select
                    name="skill"
                    defaultValue={skillLevel ?? ''}
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
            <div className="flex items-end">
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
                    <label className="text-sm sm:col-span-2">
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
