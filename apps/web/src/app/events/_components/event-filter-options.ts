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
export const PRICES = ['free', 'paid'] as const;
/**
 * Non-default sort orders. Absence of the `sort` param = the per-tab date order
 * (soonest-first upcoming, most-recent-first past), so "date" isn't listed.
 */
export const SORTS = ['distance', 'price'] as const;

export type Surface = (typeof SURFACES)[number];
export type Type = (typeof TYPES)[number];
export type Skill = (typeof SKILLS)[number];
export type AgeGroupFilter = (typeof AGE_GROUPS)[number];
export type TeamCompositionFilter = (typeof TEAM_COMPOSITIONS)[number];
export type PriceFilter = (typeof PRICES)[number];
export type SortOption = (typeof SORTS)[number];

/** Labels for the price filter (a UI construct, not a domain enum). */
export const PRICE_FILTER_LABEL: Record<PriceFilter, string> = {
  free: 'Free',
  paid: 'Paid',
};

/** Labels for the sort control. */
export const SORT_LABEL: Record<SortOption, string> = {
  distance: 'Nearest',
  price: 'Price: low to high',
};
