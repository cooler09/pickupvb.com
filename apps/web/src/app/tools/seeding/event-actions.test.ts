import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SeedBracketCommand } from '@pickupvb/application';
import { InvariantViolation, NotFoundError, UnauthorizedError } from '@pickupvb/domain';

// `vi.hoisted` so the fn exists before the hoisted `vi.mock` factory reads it
// eagerly (the mocked `handlers` is a plain object, not a lazy getter).
const { seedExecute } = vi.hoisted(() => ({ seedExecute: vi.fn() }));
vi.mock('@/lib/handlers', () => ({
  handlers: { seedBracket: { execute: seedExecute } },
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

import { applySeedingToBracket } from './event-actions';

const base = { eventId: 'e1', divisionId: 'd1', ret: '/events/e1/bracket?division=d1' };

describe('applySeedingToBracket', () => {
  beforeEach(() => {
    seedExecute.mockReset();
    revalidatePath.mockReset();
    updateTag.mockReset();
    seedExecute.mockResolvedValue(undefined);
  });

  it('seeds the bracket with the ordered entry ids and evicts caches', async () => {
    const res = await applySeedingToBracket({
      ...base,
      orderedEntryIds: ['ent-3', 'ent-1', 'ent-2'],
    });
    expect(res).toEqual({ ok: true });

    const cmd = seedExecute.mock.calls[0]![0] as SeedBracketCommand;
    expect(cmd).toBeInstanceOf(SeedBracketCommand);
    expect(cmd.divisionId).toBe('d1');
    expect(cmd.requesterId).toBe('host-1');
    expect(cmd.entryIdsInOrder).toEqual(['ent-3', 'ent-1', 'ent-2']);

    expect(revalidatePath).toHaveBeenCalledWith('/events/e1/bracket?division=d1');
    expect(updateTag).toHaveBeenCalledWith('event:e1');
  });

  it('returns invalid without calling the handler when given no entry ids', async () => {
    const res = await applySeedingToBracket({ ...base, orderedEntryIds: [] });
    expect(res).toEqual({ ok: false, reason: 'invalid', message: 'No teams to seed.' });
    expect(seedExecute).not.toHaveBeenCalled();
  });

  it('maps a missing bracket to notfound', async () => {
    seedExecute.mockRejectedValueOnce(new NotFoundError('bracket'));
    const res = await applySeedingToBracket({ ...base, orderedEntryIds: ['ent-1'] });
    expect(res).toMatchObject({ ok: false, reason: 'notfound' });
  });

  it('maps a state-machine guard to invalid', async () => {
    seedExecute.mockRejectedValueOnce(new InvariantViolation('already generated'));
    const res = await applySeedingToBracket({ ...base, orderedEntryIds: ['ent-1'] });
    expect(res).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('maps an authorization failure to forbidden', async () => {
    seedExecute.mockRejectedValueOnce(new UnauthorizedError('nope'));
    const res = await applySeedingToBracket({ ...base, orderedEntryIds: ['ent-1'] });
    expect(res).toMatchObject({ ok: false, reason: 'forbidden' });
  });
});
