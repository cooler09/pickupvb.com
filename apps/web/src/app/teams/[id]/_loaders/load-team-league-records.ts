import { computeLeagueStandings, type EntryId, type LeagueMatchResult } from '@pickupvb/domain';
import type { createSupabaseAnonClient } from '@pickupvb/supabase/anon';

type SupabaseAnonClient = ReturnType<typeof createSupabaseAnonClient>;

/**
 * One league season a persistent team played, with the team's record and
 * standings position. Cross-season history is possible because roster entries
 * carry the team's `teams.id` (ADR 0034) — host-added `walk_in` entries have no
 * team and so never appear here.
 */
export type TeamLeagueRecord = {
  eventId: string;
  eventTitle: string;
  /** `final` once the league event is completed, else the season is live. */
  state: 'in_progress' | 'final';
  divisionLabel: string;
  seasonLabel: string;
  played: number;
  wins: number;
  losses: number;
  diff: number;
  /** 1-based standings position, or null before the team has any result. */
  rank: number | null;
  totalTeams: number;
};

type EntryRow = {
  id: string;
  division_id: string;
  event_divisions: {
    label: string;
    events: {
      id: string;
      title: string;
      type: string;
      status: string;
      starts_at: string;
      ends_at: string;
    } | null;
  } | null;
};

type MatchRow = {
  division_id: string;
  home_entry_id: string | null;
  away_entry_id: string | null;
  home_score: number | null;
  away_score: number | null;
  status: LeagueMatchResult['status'];
};

function formatSeason(startsAt: string, endsAt: string): string {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat('en-US', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(iso));
  const start = fmt(startsAt);
  const end = fmt(endsAt);
  return start === end ? start : `${start} – ${end}`;
}

/**
 * League records for a persistent team, newest season first. Viewer-independent
 * and built on the public-readable `event_team_entries` + `league_schedule_matches`
 * tables, so it runs on the team page's anon client and stays cacheable. RLS
 * (`events_select`) naturally scopes to leagues the public can see.
 */
export async function loadTeamLeagueRecords(
  supabase: SupabaseAnonClient,
  teamId: string,
): Promise<TeamLeagueRecord[]> {
  const { data: entryData } = await supabase
    .from('event_team_entries')
    .select(
      'id, division_id, event_divisions!inner(label, events!inner(id, title, type, status, starts_at, ends_at))',
    )
    .eq('team_id', teamId)
    .is('deleted_at', null);

  const entries = ((entryData as unknown as EntryRow[] | null) ?? []).filter(
    (e) =>
      e.event_divisions?.events?.type === 'league' &&
      (e.event_divisions.events.status === 'published' ||
        e.event_divisions.events.status === 'completed'),
  );
  if (entries.length === 0) return [];

  const divisionIds = [...new Set(entries.map((e) => e.division_id))];
  const { data: matchData } = await supabase
    .from('league_schedule_matches')
    .select('division_id, home_entry_id, away_entry_id, home_score, away_score, status')
    .in('division_id', divisionIds);

  const matchesByDivision = new Map<string, LeagueMatchResult[]>();
  for (const r of (matchData as MatchRow[] | null) ?? []) {
    const list = matchesByDivision.get(r.division_id) ?? [];
    list.push({
      homeEntryId: r.home_entry_id as EntryId | null,
      awayEntryId: r.away_entry_id as EntryId | null,
      homeScore: r.home_score,
      awayScore: r.away_score,
      status: r.status,
    });
    matchesByDivision.set(r.division_id, list);
  }

  const ranked: Array<{ record: TeamLeagueRecord; startsAt: string }> = [];
  for (const entry of entries) {
    const event = entry.event_divisions!.events!;
    const standings = computeLeagueStandings(matchesByDivision.get(entry.division_id) ?? []);
    const idx = standings.findIndex((s) => String(s.entryId) === entry.id);
    const standing = idx >= 0 ? standings[idx]! : null;
    ranked.push({
      startsAt: event.starts_at,
      record: {
        eventId: event.id,
        eventTitle: event.title,
        state: event.status === 'completed' ? 'final' : 'in_progress',
        divisionLabel: entry.event_divisions!.label,
        seasonLabel: formatSeason(event.starts_at, event.ends_at),
        played: standing?.matchesPlayed ?? 0,
        wins: standing?.wins ?? 0,
        losses: standing?.losses ?? 0,
        diff: standing?.pointDiff ?? 0,
        rank: idx >= 0 ? idx + 1 : null,
        totalTeams: standings.length,
      },
    });
  }

  // Newest season first.
  return ranked
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())
    .map((x) => x.record);
}
