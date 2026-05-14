/**
 * Single source of truth for human-readable enum labels used across the UI.
 * Keep in sync with the enums in `@pickupvb/domain` (Surface, Format, Gender,
 * SkillLevel, EventType, EventStatus, Visibility).
 */

export const SURFACE_LABEL: Record<string, string> = {
    indoor: 'Indoor',
    grass: 'Grass',
    sand: 'Sand',
};

export const FORMAT_LABEL: Record<string, string> = {
    sixes: 'Sixes',
    quads: 'Quads',
    triples: 'Triples',
    doubles: 'Doubles',
};

export const GENDER_LABEL: Record<string, string> = {
    coed: 'Coed',
    mens: "Men's",
    womens: "Women's",
};

export const SKILL_LABEL: Record<string, string> = {
    beginner: 'Beginner',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
    competitive: 'Competitive',
};

export const TYPE_LABEL: Record<string, string> = {
    open_play: 'Open play',
    tournament: 'Tournament',
};

export const STATUS_LABEL: Record<string, string> = {
    draft: 'Draft',
    published: 'Published',
    cancelled: 'Cancelled',
    completed: 'Completed',
};

export const VISIBILITY_LABEL: Record<string, string> = {
    public: 'Public',
    friends_of_host: 'People the host follows',
    friends_of_attendees: 'People attendees follow',
    private: 'Private',
};

/**
 * Volleyball positions used on player profiles. Order matters — this array
 * drives the dropdowns in `<ProfileForm>`.
 */
export const POSITIONS = [
    'setter',
    'outside',
    'opposite',
    'middle',
    'libero',
    'defensive_specialist',
] as const;
export type Position = (typeof POSITIONS)[number];

export const POSITION_LABEL: Record<string, string> = {
    setter: 'Setter',
    outside: 'Outside hitter',
    opposite: 'Opposite',
    middle: 'Middle blocker',
    libero: 'Libero',
    defensive_specialist: 'Defensive specialist',
};

export function isPosition(v: unknown): v is Position {
    return typeof v === 'string' && (POSITIONS as readonly string[]).includes(v);
}

/** Lookup helpers that fall back to the raw value if the key isn't in the map. */
export const labelFor =
    (map: Record<string, string>) =>
        (key: string | null | undefined): string =>
            (key && map[key]) || (key ?? '');
