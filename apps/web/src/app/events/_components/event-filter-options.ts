/**
 * Filter option vocabularies + types for the events list, shared by the
 * (client) `EventFilterForm`, the (server) events page parser, and the
 * `ActiveFilterChips`. Kept out of the `'use client'` form module so the
 * server page can read the real constant arrays (`pick(...)` calls
 * `.includes()` on them) rather than client-reference proxies.
 */

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
