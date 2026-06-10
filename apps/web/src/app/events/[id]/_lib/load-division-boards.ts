import 'server-only';
import { computeLeagueStandings, DivisionId, EventId, type Match } from '@pickupvb/domain';
import { repositories } from '@/lib/handlers';
import type { CourtMatch, CourtMatchStatus } from './court-board';

/**
 * Per-division board data, gathered once across an event's divisions. Shared by
 * the court board (slice B — flattens `matches` and pivots by court) and the
 * all-divisions dashboard (slice C — renders one card per division). Keeping the
 * domain→{@link CourtMatch} mapping here means both surfaces normalize bracket
 * and league matches identically.
 */
export type DivisionStanding = {
  rank: number;
  name: string;
  played: number;
  wins: number;
  losses: number;
  diff: number;
};

export type DivisionBoard = {
  id: string;
  label: string;
  kind: 'tournament' | 'league';
  /** Coarse lifecycle for the dashboard status pill. */
  status: 'none' | 'setup' | 'active' | 'completed';
  /** True when the division is actively running — drives realtime refreshers. */
  isLive: boolean;
  /** Every playable match (no byes), normalized. */
  matches: CourtMatch[];
  /** In-progress matches, soonest first. */
  live: CourtMatch[];
  /** Upcoming matches, soonest first. */
  next: CourtMatch[];
  done: number;
  total: number;
  /** Tournament winner once the bracket is complete; null otherwise. */
  champion: string | null;
  /** League table (top rows); empty for tournaments. */
  standings: DivisionStanding[];
};

/** Bracket match → board status. Mirrors `pickLatestMatchId`'s live detection:
 *  an undecided match with at least one recorded set is already in play. */
function bracketStatus(m: Match): CourtMatchStatus {
  if (m.status === 'in_progress') return 'live';
  if (m.status !== 'completed' && m.status !== 'bye' && m.sets.length > 0) return 'live';
  if (m.status === 'pending') return 'upcoming';
  return 'done';
}

function leagueStatus(s: string): CourtMatchStatus {
  if (s === 'in_progress') return 'live';
  if (s === 'scheduled') return 'upcoming';
  return 'done';
}

function nameLookup(teams: ReadonlyArray<{ entryId: string; name: string }>) {
  const map = new Map(teams.map((t) => [t.entryId, t.name]));
  return (id: string | null): string | null => (id ? (map.get(id) ?? null) : null);
}

const bySortKey = (a: CourtMatch, b: CourtMatch) => a.sortKey - b.sortKey;

export async function loadDivisionBoards(event: {
  id: string;
  type: string;
  divisions: ReadonlyArray<{ id: string; label: string }>;
}): Promise<DivisionBoard[]> {
  const isTournament = event.type === 'tournament';

  return Promise.all(
    event.divisions.map(async (d): Promise<DivisionBoard> => {
      const teams = await repositories.bracketRepo.listRegisteredTeams(
        EventId(event.id),
        DivisionId(d.id),
      );
      const nameOf = nameLookup(teams);
      const matches: CourtMatch[] = [];
      let done = 0;
      let total = 0;

      if (isTournament) {
        const bracket = await repositories.bracketRepo.findByDivisionId(DivisionId(d.id));
        const raw = bracket?.status ?? 'none';
        const status: DivisionBoard['status'] =
          raw === 'active'
            ? 'active'
            : raw === 'completed'
              ? 'completed'
              : raw === 'none'
                ? 'none'
                : 'setup';

        let champion: string | null = null;
        if (bracket && (raw === 'active' || raw === 'completed')) {
          for (const m of bracket.matches) {
            if (m.status === 'bye') continue;
            total += 1;
            if (m.status === 'completed') done += 1;
            matches.push({
              id: String(m.id),
              court: m.court,
              divisionLabel: d.label,
              stageLabel: m.pool ? `Pool ${m.pool}` : `Round ${m.round}`,
              teamA: nameOf(m.entryAId ? String(m.entryAId) : null),
              teamB: nameOf(m.entryBId ? String(m.entryBId) : null),
              status: bracketStatus(m),
              sortKey: m.round * 1000 + m.matchNumber,
            });
          }
          if (raw === 'completed') {
            // Final = the completed match with the highest (round, matchNumber).
            const decided = bracket.matches
              .filter((m) => m.status === 'completed' && m.winnerEntryId)
              .sort((a, b) => b.round - a.round || b.matchNumber - a.matchNumber);
            const top = decided[0];
            if (top?.winnerEntryId) champion = nameOf(String(top.winnerEntryId));
          }
        }

        return {
          id: d.id,
          label: d.label,
          kind: 'tournament',
          status,
          isLive: raw === 'active',
          matches,
          live: matches.filter((m) => m.status === 'live').sort(bySortKey),
          next: matches.filter((m) => m.status === 'upcoming').sort(bySortKey),
          done,
          total,
          champion,
          standings: [],
        };
      }

      // League
      const schedule = await repositories.leagueScheduleRepo.findByDivisionId(d.id as DivisionId);
      const schedMatches = schedule?.matches ?? [];
      for (const m of schedMatches) {
        total += 1;
        if (m.status === 'completed' || m.status === 'forfeit') done += 1;
        matches.push({
          id: String(m.id),
          court: m.courtLabel,
          divisionLabel: d.label,
          stageLabel: `Week ${m.weekNumber}`,
          teamA: nameOf(m.homeEntryId ? String(m.homeEntryId) : null),
          teamB: nameOf(m.awayEntryId ? String(m.awayEntryId) : null),
          status: leagueStatus(m.status),
          sortKey: m.scheduledAt.getTime(),
        });
      }
      const standings: DivisionStanding[] = computeLeagueStandings(schedMatches)
        .slice(0, 5)
        .map((s, i) => ({
          rank: i + 1,
          name: nameOf(String(s.entryId)) ?? 'Unknown team',
          played: s.matchesPlayed,
          wins: s.wins,
          losses: s.losses,
          diff: s.pointDiff,
        }));
      const live = matches.filter((m) => m.status === 'live').sort(bySortKey);
      const status: DivisionBoard['status'] =
        total === 0 ? 'none' : done === total ? 'completed' : 'active';

      return {
        id: d.id,
        label: d.label,
        kind: 'league',
        status,
        isLive: live.length > 0,
        matches,
        live,
        next: matches.filter((m) => m.status === 'upcoming').sort(bySortKey),
        done,
        total,
        champion: null,
        standings,
      };
    }),
  );
}
