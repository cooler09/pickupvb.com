/**
 * The pure, denormalised snapshot the system-badge rules consume.
 *
 * Why a snapshot: the earn rules (`badge-catalog.ts` → `qualifies`) must stay
 * pure and unit-testable, but the underlying facts (attendance, championships,
 * league completions) live across several tables. The infrastructure adapter
 * (`SupabaseBadgeRepository.loadStats`) does the SQL aggregation once and hands
 * the rules this flat snapshot — so the **thresholds stay in TS** (the catalog)
 * and SQL only counts. That split keeps the badge thresholds from drifting into
 * a hand-maintained second copy in a SQL reconciler.
 *
 * Every count is anti-gaming by construction: it derives from *attended* /
 * *completed* facts, never from raw joins, so a join-then-leave never inflates a
 * milestone (persona-ux / gamification design note).
 */
export interface PlayerBadgeStats {
  /** Events this user has published as host (status = 'published'). */
  publishedEventCount: number;
  /** Distinct past, non-cancelled events the user actually attended. */
  attendedEventCount: number;
  /** Distinct positions the user has played across positional events. */
  distinctPositionsPlayed: number;
  /** Tournament brackets this user won (member of the final winning entry). */
  tournamentChampionships: number;
  /** Tournament brackets where the user's entry placed top-3. */
  tournamentPodiums: number;
  /** League seasons the user participated in that have completed. */
  leaguesCompleted: number;
  /** Largest number of attended events sharing a single host (loyalty). */
  maxEventsWithSingleHost: number;
}

/** A zeroed snapshot — the baseline a brand-new account reconciles against. */
export const emptyPlayerBadgeStats = (): PlayerBadgeStats => ({
  publishedEventCount: 0,
  attendedEventCount: 0,
  distinctPositionsPlayed: 0,
  tournamentChampionships: 0,
  tournamentPodiums: 0,
  leaguesCompleted: 0,
  maxEventsWithSingleHost: 0,
});
