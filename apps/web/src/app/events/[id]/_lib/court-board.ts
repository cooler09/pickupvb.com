/**
 * Pure view logic for the "next up on court" board (tournament-displays slice B).
 *
 * Takes a flat list of normalized matches gathered across every division of an
 * event (bracket matches for tournaments, schedule matches for leagues — the
 * page does that domain→{@link CourtMatch} mapping) and pivots them **by court**
 * so a gym TV answers the two questions players actually ask: what's on this
 * court right now, and who's up next.
 *
 * No React, no domain imports — just the grouping/ordering rules, so it's
 * unit-tested in isolation (`court-board.test.ts`).
 */

export type CourtMatchStatus = 'live' | 'upcoming' | 'done';

export type CourtMatch = {
  id: string;
  /** Free-text court label, or null when the match isn't assigned to a court. */
  court: string | null;
  divisionLabel: string;
  /** Short stage hint, e.g. "Pool A", "Bracket", "Week 3". */
  stageLabel: string;
  /** Team name, or null when the slot is still TBD (undecided feeder match). */
  teamA: string | null;
  teamB: string | null;
  status: CourtMatchStatus;
  /** Lower sorts sooner — round·matchNumber for brackets, start-time for leagues. */
  sortKey: number;
};

export type CourtColumn = {
  court: string;
  /** The in-progress match on this court, if any. */
  now: CourtMatch | null;
  /** The soonest upcoming match on this court, if any. */
  next: CourtMatch | null;
  /** Upcoming matches beyond `next` still queued for this court. */
  laterCount: number;
};

export type CourtBoard = {
  courts: CourtColumn[];
  /** True when at least one match carries a court label. When false the page
   *  renders the flat `unassigned*` lists as the primary view. */
  hasCourts: boolean;
  /** Live / upcoming matches with no court label (fallback or "not on a court"). */
  unassignedNow: CourtMatch[];
  unassignedNext: CourtMatch[];
};

function hasCourt(m: CourtMatch): boolean {
  return !!m.court && m.court.trim() !== '';
}

/** Natural sort so "Court 2" precedes "Court 10". */
function compareCourts(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function buildCourtBoard(matches: ReadonlyArray<CourtMatch>): CourtBoard {
  const byCourt = new Map<string, CourtMatch[]>();
  const unassigned: CourtMatch[] = [];

  for (const m of matches) {
    if (hasCourt(m)) {
      const key = m.court!.trim();
      const list = byCourt.get(key);
      if (list) list.push(m);
      else byCourt.set(key, [m]);
    } else {
      unassigned.push(m);
    }
  }

  const courts: CourtColumn[] = [...byCourt.keys()].sort(compareCourts).map((court) => {
    const list = byCourt.get(court)!;
    const now = list.find((m) => m.status === 'live') ?? null;
    const upcoming = list
      .filter((m) => m.status === 'upcoming')
      .sort((a, b) => a.sortKey - b.sortKey);
    return {
      court,
      now,
      next: upcoming[0] ?? null,
      laterCount: Math.max(0, upcoming.length - 1),
    };
  });

  const unassignedNow = unassigned.filter((m) => m.status === 'live');
  const unassignedNext = unassigned
    .filter((m) => m.status === 'upcoming')
    .sort((a, b) => a.sortKey - b.sortKey);

  return {
    courts,
    hasCourts: byCourt.size > 0,
    unassignedNow,
    unassignedNext,
  };
}
