import { describe, it, expect } from 'vitest';
import { Capacity, EventPosition, Format } from '@pickupvb/domain';
import {
  computeSpotsRemaining,
  mapAttendees,
  mapCoHosts,
  mapRegisteredTeams,
  mapViewerHostableGroups,
  mapWinnerLabels,
  type AttendeeRow,
  type CoHostJoinRow,
  type ProfileRow,
  type TeamJoinRow,
} from './mappers.js';

// These pure mappers used to be inlined in the ~480-LOC
// `SupabaseEventRepository.getDetail`, so the waitlist math, the team/payment
// merge, the winner-label preference, and the spots calc had no test seam
// (architecture audit P2-3). Each test pins a behaviour that was previously
// only exercised end-to-end through a live Supabase read.

const profile = (id: string): ProfileRow => ({
  id,
  handle: `h_${id}`,
  display_name: `Name ${id}`,
  first_name: null,
  last_name: null,
  avatar_url: null,
});

const attendee = (
  userId: string,
  position: string | null,
  joinedAt: string,
  withProfile = true,
): AttendeeRow => ({
  user_id: userId,
  joined_at: joinedAt,
  position,
  profiles: withProfile
    ? {
        handle: `h_${userId}`,
        display_name: `Name ${userId}`,
        first_name: null,
        last_name: null,
        avatar_url: null,
      }
    : null,
});

describe('mapAttendees', () => {
  it('waitlists the later signup once a position is over its roster target', () => {
    const roster = new Map<EventPosition, number>([[EventPosition.Setter, 1]]);
    const { attendees, filledByPosition } = mapAttendees(
      [
        attendee('early', EventPosition.Setter, '2026-01-01T00:00:00Z'),
        attendee('late', EventPosition.Setter, '2026-01-02T00:00:00Z'),
      ],
      roster,
    );
    expect(attendees[0]?.waitlist).toBe(false); // earliest keeps the seat
    expect(attendees[1]?.waitlist).toBe(true); // second exceeds target of 1
    expect(filledByPosition.get(EventPosition.Setter)).toBe(2);
  });

  it('never waitlists when there is no position roster, but still tallies fill', () => {
    const { attendees, filledByPosition } = mapAttendees(
      [
        attendee('a', EventPosition.Setter, '2026-01-01T00:00:00Z'),
        attendee('b', EventPosition.Setter, '2026-01-02T00:00:00Z'),
      ],
      null,
    );
    expect(attendees.every((a) => a.waitlist === false)).toBe(true);
    expect(filledByPosition.get(EventPosition.Setter)).toBe(2);
  });

  it('ignores unknown / null positions (not counted, position null)', () => {
    const roster = new Map<EventPosition, number>([[EventPosition.Setter, 1]]);
    const { attendees, filledByPosition } = mapAttendees(
      [attendee('x', 'bogus', '2026-01-01T00:00:00Z'), attendee('y', null, '2026-01-02T00:00:00Z')],
      roster,
    );
    expect(attendees[0]?.position).toBeNull();
    expect(attendees[1]?.position).toBeNull();
    expect(filledByPosition.size).toBe(0);
  });

  it('falls back to the user id / "Player" when the profile embed is null', () => {
    const { attendees } = mapAttendees([attendee('u1', null, '2026-01-01T00:00:00Z', false)], null);
    expect(attendees[0]?.profile).toMatchObject({
      id: 'u1',
      handle: 'u1',
      displayName: 'Player',
    });
  });
});

describe('computeSpotsRemaining', () => {
  it('sums per-position targets for positional events', () => {
    const roster = new Map<EventPosition, number>([
      [EventPosition.Setter, 2],
      [EventPosition.Outside, 3],
    ]);
    expect(computeSpotsRemaining(roster, null, 2)).toBe(3); // 5 target - 2 filled
  });

  it('clamps positional and fixed-capacity results at zero', () => {
    const roster = new Map<EventPosition, number>([[EventPosition.Setter, 2]]);
    expect(computeSpotsRemaining(roster, null, 5)).toBe(0);
    expect(computeSpotsRemaining(null, Capacity.fixed(4), 10)).toBe(0);
  });

  it('subtracts attendees from a fixed capacity', () => {
    expect(computeSpotsRemaining(null, Capacity.fixed(10), 4)).toBe(6);
  });

  it('returns null for unlimited capacity or no capacity at all', () => {
    expect(computeSpotsRemaining(null, Capacity.unlimited(), 3)).toBeNull();
    expect(computeSpotsRemaining(null, null, 3)).toBeNull();
  });
});

describe('mapRegisteredTeams', () => {
  const teamRow = (teamId: string, divisionId: string | null, withTeam = true): TeamJoinRow => ({
    team_id: teamId,
    division_id: divisionId,
    teams: withTeam
      ? {
          id: teamId,
          slug: `s_${teamId}`,
          name: `Team ${teamId}`,
          format: Format.Doubles,
          captain_id: `cap_${teamId}`,
          captain: profile(`cap_${teamId}`),
        }
      : null,
  });

  it('merges roster size, payment, and division onto each team', () => {
    const teams = mapRegisteredTeams(
      [teamRow('t1', 'd1')],
      new Map([['t1', 3]]),
      new Map([['t1', { team_id: 't1', payment_status: 'paid', amount_paid_cents: 5000 }]]),
    );
    expect(teams).toHaveLength(1);
    expect(teams[0]).toMatchObject({
      teamId: 't1',
      divisionId: 'd1',
      memberCount: 3,
      payment: { status: 'paid', amountPaidCents: 5000 },
    });
    expect(teams[0]?.captain?.id).toBe('cap_t1');
  });

  it('defaults memberCount to 0 and payment to null when absent', () => {
    const [team] = mapRegisteredTeams([teamRow('t2', null)], new Map(), new Map());
    expect(team?.memberCount).toBe(0);
    expect(team?.payment).toBeNull();
    expect(team?.divisionId).toBeNull();
  });

  it('drops rows whose embedded team is null (RLS-filtered / deleted)', () => {
    const teams = mapRegisteredTeams([teamRow('gone', 'd1', false)], new Map(), new Map());
    expect(teams).toHaveLength(0);
  });
});

describe('mapWinnerLabels', () => {
  it('prefers the live team name over the entry display name', () => {
    const labels = mapWinnerLabels(
      [{ id: 'div1', winner_entry_id: 'e1' }],
      [{ id: 'e1', display_name: 'Ad-hoc Squad', team_id: 't1', teams: { name: 'Roster Team' } }],
    );
    expect(labels.get('div1')).toBe('Roster Team');
  });

  it('uses the display name when no team is linked', () => {
    const labels = mapWinnerLabels(
      [{ id: 'div1', winner_entry_id: 'e1' }],
      [{ id: 'e1', display_name: 'Walk-in Crew', team_id: null, teams: null }],
    );
    expect(labels.get('div1')).toBe('Walk-in Crew');
  });

  it('omits divisions with no winner or a missing entry row', () => {
    const labels = mapWinnerLabels(
      [
        { id: 'div1', winner_entry_id: null },
        { id: 'div2', winner_entry_id: 'missing' },
      ],
      [],
    );
    expect(labels.has('div1')).toBe(false);
    expect(labels.has('div2')).toBe(false);
  });
});

describe('mapCoHosts', () => {
  it('splits user and group co-hosts and collects group ids', () => {
    const rows: CoHostJoinRow[] = [
      { host_user_id: 'u1', host_group_id: null, profiles: profile('u1'), groups: null },
      {
        host_user_id: null,
        host_group_id: 'g1',
        profiles: null,
        groups: { id: 'g1', slug: 'grp', name: 'Group One', avatar_url: null },
      },
    ];
    const { coHostUsers, coHostGroups, coGroupIds } = mapCoHosts(rows);
    expect(coHostUsers.map((u) => u.id)).toEqual(['u1']);
    expect(coHostGroups.map((g) => g.id)).toEqual(['g1']);
    expect(coGroupIds).toEqual(['g1']);
  });
});

describe('mapViewerHostableGroups', () => {
  it('excludes the host group and any co-hosting group', () => {
    const rows = [
      { groups: { id: 'host', name: 'Host Group' } },
      { groups: { id: 'cohost', name: 'Co-host Group' } },
      { groups: { id: 'free', name: 'Free Group' } },
      { groups: null },
    ];
    const out = mapViewerHostableGroups(rows, 'host', ['cohost']);
    expect(out.map((g) => g.id)).toEqual(['free']);
  });
});
