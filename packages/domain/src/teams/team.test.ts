import { describe, it, expect } from 'vitest';
import { MAX_TEAM_ROSTER, Team, type TeamId, type UserId, type TeamMemberStatus } from './team.js';
import { InvariantViolation, ValidationError } from '../shared/result.js';

const CAPTAIN = 'cap-1' as UserId;
const ALICE = 'alice' as UserId;
const BOB = 'bob' as UserId;
const CARL = 'carl' as UserId;
const FRANK = 'frank' as UserId;
const GINA = 'gina' as UserId;

function makeTeam(name = 'Hitters'): Team {
  return Team.create({ id: 't-1' as TeamId, captainId: CAPTAIN, name });
}

describe('Team.create', () => {
  it('seeds the captain as the only active member', () => {
    const team = makeTeam();
    expect(team.captainId).toBe(CAPTAIN);
    expect(team.activeMembers.has(CAPTAIN)).toBe(true);
    expect(team.activeMembers.size).toBe(1);
    expect(team.pendingMembers.size).toBe(0);
    expect(team.rosterSize).toBe(1);
    expect(team.extraMemberCount).toBe(0);
  });

  it('trims whitespace from the name', () => {
    const team = Team.create({
      id: 't-2' as TeamId,
      captainId: CAPTAIN,
      name: '  Spikers  ',
    });
    expect(team.name).toBe('Spikers');
  });

  it('rejects an empty name', () => {
    expect(() => Team.create({ id: 't-x' as TeamId, captainId: CAPTAIN, name: '' })).toThrow(
      InvariantViolation,
    );
  });

  it('rejects a whitespace-only name', () => {
    expect(() => Team.create({ id: 't-x' as TeamId, captainId: CAPTAIN, name: '   ' })).toThrow(
      InvariantViolation,
    );
  });

  it('hard-blocks a profane name rather than masking it (ADR 0030)', () => {
    expect(() =>
      Team.create({
        id: 't-x' as TeamId,
        captainId: CAPTAIN,
        name: 'Shit Squad',
      }),
    ).toThrow(ValidationError);
  });
});

describe('Team.rehydrate', () => {
  it('preserves the members map verbatim (other than the captain)', () => {
    const members = new Map<UserId, TeamMemberStatus>([
      [CAPTAIN, 'active'],
      [ALICE, 'active'],
      [BOB, 'pending'],
    ]);
    const team = Team.rehydrate({
      id: 't-1' as TeamId,
      captainId: CAPTAIN,
      name: 'Diggers',
      members,
    });
    expect(team.allMembers.get(ALICE)).toBe('active');
    expect(team.allMembers.get(BOB)).toBe('pending');
  });

  it('forces the captain to active even if persisted state says otherwise', () => {
    const members = new Map<UserId, TeamMemberStatus>([[CAPTAIN, 'pending']]);
    const team = Team.rehydrate({
      id: 't-1' as TeamId,
      captainId: CAPTAIN,
      name: 'Setters',
      members,
    });
    expect(team.allMembers.get(CAPTAIN)).toBe('active');
  });

  it('defaults extraMemberCount to 0 when omitted', () => {
    const team = Team.rehydrate({
      id: 't-1' as TeamId,
      captainId: CAPTAIN,
      name: 'Blockers',
      members: new Map([[CAPTAIN, 'active']]),
    });
    expect(team.extraMemberCount).toBe(0);
  });

  it('clamps a negative extraMemberCount to 0', () => {
    const team = Team.rehydrate({
      id: 't-1' as TeamId,
      captainId: CAPTAIN,
      name: 'Blockers',
      members: new Map([[CAPTAIN, 'active']]),
      extraMemberCount: -5,
    });
    expect(team.extraMemberCount).toBe(0);
  });
});

describe('Team roster sizing', () => {
  it('caps roster at a fixed maximum (ADR 0013 — teams carry no format)', () => {
    // The roster cap is the same for every team; there is no format to vary.
    expect(makeTeam().maxRoster).toBe(MAX_TEAM_ROSTER);
  });

  it('counts active + pending + extras toward rosterSize', () => {
    const team = makeTeam();
    team.inviteMember(ALICE, true);
    team.inviteMember(BOB, false);
    team.setExtraMemberCount(2);
    expect(team.rosterSize).toBe(5); // captain + alice + bob + 2 extras
  });
});

describe('Team.inviteMember', () => {
  it('adds an active member when autoAccept is true', () => {
    const team = makeTeam();
    team.inviteMember(ALICE, true);
    expect(team.activeMembers.has(ALICE)).toBe(true);
    expect(team.pendingMembers.has(ALICE)).toBe(false);
  });

  it('adds a pending member when autoAccept is false', () => {
    const team = makeTeam();
    team.inviteMember(ALICE, false);
    expect(team.pendingMembers.has(ALICE)).toBe(true);
    expect(team.activeMembers.has(ALICE)).toBe(false);
  });

  it('throws when the user is already on the team (active)', () => {
    const team = makeTeam();
    team.inviteMember(ALICE, true);
    expect(() => team.inviteMember(ALICE, true)).toThrow(InvariantViolation);
  });

  it('throws when the user is already pending', () => {
    const team = makeTeam();
    team.inviteMember(ALICE, false);
    expect(() => team.inviteMember(ALICE, true)).toThrow(InvariantViolation);
  });

  it('throws when re-inviting the captain', () => {
    const team = makeTeam();
    expect(() => team.inviteMember(CAPTAIN, true)).toThrow(InvariantViolation);
  });

  it('throws when the roster is at the cap', () => {
    const team = makeTeam();
    // Captain takes 1 slot; fill the rest with off-site extras to reach the cap.
    team.setExtraMemberCount(MAX_TEAM_ROSTER - 1);
    expect(team.rosterSize).toBe(MAX_TEAM_ROSTER);
    expect(() => team.inviteMember(FRANK, true)).toThrow(InvariantViolation);
  });

  it('counts extras against the roster cap', () => {
    const team = makeTeam(); // captain already takes 1
    team.setExtraMemberCount(MAX_TEAM_ROSTER - 1);
    expect(() => team.inviteMember(ALICE, true)).toThrow(InvariantViolation);
  });

  it('allows pending members to fill the cap alongside active', () => {
    const team = makeTeam();
    // Captain + extras leaves exactly two open slots.
    team.setExtraMemberCount(MAX_TEAM_ROSTER - 3);
    team.inviteMember(ALICE, true); // active fills one
    team.inviteMember(BOB, false); // pending fills the last
    expect(() => team.inviteMember(CARL, false)).toThrow(InvariantViolation);
  });
});

describe('Team.acceptInvite', () => {
  it('flips a pending member to active', () => {
    const team = makeTeam();
    team.inviteMember(ALICE, false);
    team.acceptInvite(ALICE);
    expect(team.activeMembers.has(ALICE)).toBe(true);
    expect(team.pendingMembers.has(ALICE)).toBe(false);
  });

  it('is a no-op for an already-active member', () => {
    const team = makeTeam();
    team.inviteMember(ALICE, true);
    expect(() => team.acceptInvite(ALICE)).not.toThrow();
    expect(team.activeMembers.has(ALICE)).toBe(true);
  });

  it('throws when no invite exists for the user', () => {
    const team = makeTeam();
    expect(() => team.acceptInvite(GINA)).toThrow(InvariantViolation);
  });
});

describe('Team.removeMember', () => {
  it('removes an active member', () => {
    const team = makeTeam();
    team.inviteMember(ALICE, true);
    team.removeMember(ALICE);
    expect(team.allMembers.has(ALICE)).toBe(false);
  });

  it('removes a pending member', () => {
    const team = makeTeam();
    team.inviteMember(ALICE, false);
    team.removeMember(ALICE);
    expect(team.allMembers.has(ALICE)).toBe(false);
  });

  it('throws when removing the captain', () => {
    const team = makeTeam();
    expect(() => team.removeMember(CAPTAIN)).toThrow(InvariantViolation);
  });

  it('frees a slot so the captain can re-invite up to the cap', () => {
    const team = makeTeam();
    team.setExtraMemberCount(MAX_TEAM_ROSTER - 2); // captain + extras = cap - 1
    team.inviteMember(ALICE, true); // now exactly at the cap
    expect(team.rosterSize).toBe(MAX_TEAM_ROSTER);
    expect(() => team.inviteMember(BOB, true)).toThrow(InvariantViolation);
    team.removeMember(ALICE);
    expect(() => team.inviteMember(BOB, true)).not.toThrow();
  });
});

describe('Team.rename', () => {
  it('updates the name', () => {
    const team = makeTeam('Hitters');
    team.rename('Diggers');
    expect(team.name).toBe('Diggers');
  });

  it('trims whitespace from the new name', () => {
    const team = makeTeam();
    team.rename('  Spikers  ');
    expect(team.name).toBe('Spikers');
  });

  it('rejects an empty name', () => {
    const team = makeTeam();
    expect(() => team.rename('')).toThrow(InvariantViolation);
  });

  it('rejects a whitespace-only name', () => {
    const team = makeTeam();
    expect(() => team.rename('   ')).toThrow(InvariantViolation);
  });

  it('hard-blocks a profane name rather than masking it (ADR 0030)', () => {
    const team = makeTeam();
    expect(() => team.rename('Shit Squad')).toThrow(ValidationError);
  });
});

describe('Team.setExtraMemberCount', () => {
  it('accepts a valid non-negative integer', () => {
    const team = makeTeam();
    team.setExtraMemberCount(3);
    expect(team.extraMemberCount).toBe(3);
  });

  it('accepts 0', () => {
    const team = makeTeam();
    team.setExtraMemberCount(0);
    expect(team.extraMemberCount).toBe(0);
  });

  it('rejects negative values', () => {
    const team = makeTeam();
    expect(() => team.setExtraMemberCount(-1)).toThrow(InvariantViolation);
  });

  it('rejects non-integer values', () => {
    const team = makeTeam();
    expect(() => team.setExtraMemberCount(1.5)).toThrow(InvariantViolation);
  });

  it('rejects NaN', () => {
    const team = makeTeam();
    expect(() => team.setExtraMemberCount(Number.NaN)).toThrow(InvariantViolation);
  });

  it('rejects a count that would exceed the roster cap', () => {
    const team = makeTeam(); // captain takes 1
    expect(() => team.setExtraMemberCount(MAX_TEAM_ROSTER)).toThrow(InvariantViolation);
  });

  it('allows setting extras up to the remaining cap', () => {
    const team = makeTeam(); // captain takes 1
    team.setExtraMemberCount(MAX_TEAM_ROSTER - 1);
    expect(team.rosterSize).toBe(MAX_TEAM_ROSTER);
  });
});
