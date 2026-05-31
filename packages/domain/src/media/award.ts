/**
 * Community award categories voted on a per-event basis. Fixed set (ADR 0024) —
 * adding one is a one-line change here plus a check-constraint migration.
 *
 * Only `clip` media posts are votable (see {@link MediaPost.assertVotable}).
 */
export type AwardCategory = 'best_clip' | 'biggest_fail';

export const AWARD_CATEGORIES: readonly AwardCategory[] = ['best_clip', 'biggest_fail'];

export function isAwardCategory(value: string): value is AwardCategory {
  return (AWARD_CATEGORIES as readonly string[]).includes(value);
}
