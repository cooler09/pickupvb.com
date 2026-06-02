import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegisterWalkInTeamCommand } from '@pickupvb/application';
import { ConflictError, UnauthorizedError } from '@pickupvb/domain';

// Isolate the write-back from auth, the handlers, and Next's cache so we can pin
// the contract: one RegisterWalkInTeamCommand per team (captain_id null — the
// host is the creator, not a player), with the roster mapped to members — and
// partial-progress reporting on a mid-loop fail.
// `vi.hoisted` so the fn exists before the hoisted `vi.mock` factory reads it
// eagerly (the mocked `handlers` is a plain object, not a lazy getter).
const { registerExecute } = vi.hoisted(() => ({ registerExecute: vi.fn() }));
vi.mock('@/lib/handlers', () => ({
  handlers: { registerWalkInTeam: { execute: registerExecute } },
}));
vi.mock('@/lib/server-auth', () => ({
  requireRealUser: async () => ({ user: { id: 'host-1' } }),
}));
const revalidatePath = vi.fn();
const updateTag = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (p: string) => revalidatePath(p),
  updateTag: (t: string) => updateTag(t),
}));

import { saveRandomTeamsToEvent } from './event-actions';

const base = {
  eventId: 'e1',
  divisionId: 'd1',
  ret: '/events/e1/manage',
};

describe('saveRandomTeamsToEvent', () => {
  beforeEach(() => {
    registerExecute.mockReset();
    revalidatePath.mockReset();
    updateTag.mockReset();
    registerExecute.mockResolvedValue({ id: 'reg' });
  });

  it('registers one walk-in team per generated team with no captain account', async () => {
    const res = await saveRandomTeamsToEvent({
      ...base,
      teams: [
        { name: 'Team 1', players: ['Alex', 'Bo'] },
        { name: 'Team 2', players: ['Cara', 'Dev'] },
      ],
    });

    expect(res).toEqual({ ok: true, created: 2 });
    expect(registerExecute).toHaveBeenCalledTimes(2);

    const cmd = registerExecute.mock.calls[0]![0] as RegisterWalkInTeamCommand;
    expect(cmd).toBeInstanceOf(RegisterWalkInTeamCommand);
    expect(cmd.eventId).toBe('e1');
    expect(cmd.divisionId).toBe('d1');
    // The acting user is the host (creator), not the team's captain — the
    // walk-in carries no captain_id so badges / upcoming-events don't credit
    // the host as a player.
    expect(cmd.hostId).toBe('host-1');
    expect(cmd.name).toBe('Team 1');
    expect(cmd.captainDisplayName).toBe('Team 1');
    expect(cmd.captainPhone).toBeNull();
    expect(cmd.members).toEqual([
      { displayName: 'Alex', email: null, userId: null },
      { displayName: 'Bo', email: null, userId: null },
    ]);

    expect(revalidatePath).toHaveBeenCalledWith('/events/e1/manage');
    expect(updateTag).toHaveBeenCalledWith('event:e1');
  });

  it('trims and drops blank player names, and skips teams left empty', async () => {
    const res = await saveRandomTeamsToEvent({
      ...base,
      teams: [
        { name: '', players: ['  Alex  ', '', '   '] },
        { name: 'Empty', players: ['', '  '] },
      ],
    });

    expect(res).toEqual({ ok: true, created: 1 });
    expect(registerExecute).toHaveBeenCalledTimes(1);
    const cmd = registerExecute.mock.calls[0]![0] as RegisterWalkInTeamCommand;
    expect(cmd.name).toBe('Team 1'); // blank name → positional default
    expect(cmd.captainDisplayName).toBe('Team 1');
    expect(cmd.members).toEqual([{ displayName: 'Alex', email: null, userId: null }]);
  });

  it('returns invalid without calling the handler when there is nothing to save', async () => {
    const res = await saveRandomTeamsToEvent({ ...base, teams: [{ name: 'x', players: [] }] });
    expect(res).toEqual({ ok: false, reason: 'invalid', created: 0, message: 'No teams to save.' });
    expect(registerExecute).not.toHaveBeenCalled();
  });

  it('reports partial progress and the typed reason when a later team fails', async () => {
    registerExecute.mockResolvedValueOnce({ id: 'reg1' });
    registerExecute.mockRejectedValueOnce(new ConflictError('dup'));
    const res = await saveRandomTeamsToEvent({
      ...base,
      teams: [
        { name: 'A', players: ['p1'] },
        { name: 'B', players: ['p2'] },
      ],
    });
    expect(res.ok).toBe(false);
    expect(res).toMatchObject({ reason: 'conflict', created: 1 });
    // still evicts caches for the row that did land
    expect(updateTag).toHaveBeenCalledWith('event:e1');
  });

  it('maps an authorization failure to forbidden', async () => {
    registerExecute.mockRejectedValueOnce(new UnauthorizedError('nope'));
    const res = await saveRandomTeamsToEvent({ ...base, teams: [{ name: 'A', players: ['p1'] }] });
    expect(res).toMatchObject({ ok: false, reason: 'forbidden', created: 0 });
  });
});
