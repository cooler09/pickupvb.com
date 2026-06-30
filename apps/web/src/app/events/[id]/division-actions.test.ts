import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvariantViolation } from '@pickupvb/domain';

/**
 * Regression: editing/adding a division into an invalid registration config
 * (ADR 0012/0016 — e.g. team registration on a per-player *paid* division)
 * makes `VolleyballEvent.assertRegistrationConfigValid` throw a typed
 * `InvariantViolation` from inside `updateDivision` / `addDivision`. The
 * `<form action>` server actions had no catch, so the throw bubbled out as an
 * unhandled error → a Next 500 with a `digest` (this is the
 * `InvariantViolation … at updateDivision` line that showed up in the dev
 * logs). The fix catches `DomainError` and returns it as inline form state.
 *
 * These tests fail against the pre-fix code: the action *throws* instead of
 * resolving to `{ error }`.
 */

const h = vi.hoisted(() => ({
  getViewer: vi.fn(),
  getEventDetail: vi.fn(),
  addEventDivision: vi.fn(),
  updateEventDivision: vi.fn(),
  removeEventDivision: vi.fn(),
  revalidatePath: vi.fn(),
  redirectEventNotice: vi.fn((id: string, key: string, val: string) => {
    throw new Error(`REDIRECT:/events/${id}?${key}=${val}`);
  }),
}));

vi.mock('next/cache', () => ({ revalidatePath: (p: string) => h.revalidatePath(p) }));
vi.mock('@/lib/server-auth', () => ({ getViewer: h.getViewer }));
vi.mock('@/lib/server-redirects', () => ({ redirectEventNotice: h.redirectEventNotice }));
vi.mock('@/lib/handlers', () => ({
  handlers: {
    getEventDetail: { execute: h.getEventDetail },
    addEventDivision: { execute: h.addEventDivision },
    updateEventDivision: { execute: h.updateEventDivision },
    removeEventDivision: { execute: h.removeEventDivision },
  },
}));

import { addDivisionFromForm, updateDivisionFromForm } from './division-actions';

/** Minimal schema-valid division form (cross-field rules are the domain's job). */
function divForm(over: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const base: Record<string, string> = {
    label: 'A',
    surface: 'indoor',
    format: 'sixes',
    gender: 'coed',
    skillTier: 'bb',
  };
  for (const [k, v] of Object.entries({ ...base, ...over })) fd.set(k, v);
  return fd;
}

// The exact host-facing message the domain throws for the per-player + team
// registration combo — what the user saw in the logs.
const TEAM_PRICING_MSG =
  'Team-registered divisions require per-team pricing. Division "A" is priced per-player — ' +
  'the captain pays for the team. Switch the division to per-team pricing or set the ' +
  'division\'s team registration mode to "none".';

beforeEach(() => {
  vi.clearAllMocks();
  h.getViewer.mockResolvedValue({ user: { id: 'host-1' }, isAnonymous: false });
  h.getEventDetail.mockResolvedValue({ canManage: true });
});

describe('updateDivisionFromForm — domain-error handling', () => {
  it('returns the InvariantViolation message inline instead of throwing (500 regression)', async () => {
    h.updateEventDivision.mockRejectedValue(new InvariantViolation(TEAM_PRICING_MSG));
    const state = await updateDivisionFromForm('e1', 'd1', '/events/e1/manage', {}, divForm());
    expect(state).toEqual({ error: TEAM_PRICING_MSG });
    // A failed save must not revalidate (nothing changed).
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it('returns success and revalidates on a clean save', async () => {
    h.updateEventDivision.mockResolvedValue(undefined);
    const state = await updateDivisionFromForm('e1', 'd1', '/events/e1/manage', {}, divForm());
    expect(state).toEqual({ success: true });
    expect(h.revalidatePath).toHaveBeenCalledWith('/events/e1/manage');
  });

  it('rethrows an unexpected (non-domain) error so it still reaches Sentry', async () => {
    h.updateEventDivision.mockRejectedValue(new Error('db down'));
    await expect(
      updateDivisionFromForm('e1', 'd1', '/events/e1/manage', {}, divForm()),
    ).rejects.toThrow('db down');
  });

  it('redirects a non-manager before touching the handler', async () => {
    h.getEventDetail.mockResolvedValue({ canManage: false });
    await expect(
      updateDivisionFromForm('e1', 'd1', '/events/e1/manage', {}, divForm()),
    ).rejects.toThrow('REDIRECT:/events/e1?rsvp=forbidden');
    expect(h.updateEventDivision).not.toHaveBeenCalled();
  });
});

describe('addDivisionFromForm — domain-error handling', () => {
  it('returns the domain message inline instead of throwing', async () => {
    h.addEventDivision.mockRejectedValue(new InvariantViolation(TEAM_PRICING_MSG));
    const state = await addDivisionFromForm('e1', '/events/e1/manage', {}, divForm());
    expect(state).toEqual({ error: TEAM_PRICING_MSG });
  });

  it('returns success on a clean add', async () => {
    h.addEventDivision.mockResolvedValue({ id: 'd2' });
    const state = await addDivisionFromForm('e1', '/events/e1/manage', {}, divForm());
    expect(state).toEqual({ success: true });
    expect(h.revalidatePath).toHaveBeenCalledWith('/events/e1/manage');
  });
});
