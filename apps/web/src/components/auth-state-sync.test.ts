import { describe, it, expect, vi } from 'vitest';

// `reduceAuthSync` is exported from the `'use client'` component module. Mock
// the framework boundaries it imports at module top so this node-env test can
// load it without pulling in the real next/navigation + supabase clients.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock('@pickupvb/supabase/browser', () => ({ createSupabaseBrowserClient: () => ({}) }));

import { reduceAuthSync } from './auth-state-sync';

const U1 = 'user-1';
const U2 = 'user-2';

describe('reduceAuthSync', () => {
  it('seeds the baseline from the first emission without refreshing', () => {
    // INITIAL_SESSION for a signed-in viewer — the server already rendered it.
    expect(reduceAuthSync(undefined, 'INITIAL_SESSION', U1)).toEqual({ next: U1, refresh: false });
    // …and for a signed-out viewer.
    expect(reduceAuthSync(undefined, 'INITIAL_SESSION', null)).toEqual({
      next: null,
      refresh: false,
    });
  });

  it('never refreshes on TOKEN_REFRESHED (the reload-loop guard)', () => {
    expect(reduceAuthSync(U1, 'TOKEN_REFRESHED', U1)).toEqual({ next: U1, refresh: false });
  });

  it('refreshes on a real sign-in (identity transition)', () => {
    expect(reduceAuthSync(null, 'SIGNED_IN', U1)).toEqual({ next: U1, refresh: true });
  });

  it('refreshes on sign-out', () => {
    expect(reduceAuthSync(U1, 'SIGNED_OUT', null)).toEqual({ next: null, refresh: true });
  });

  it('refreshes when switching to a different user', () => {
    expect(reduceAuthSync(U1, 'SIGNED_IN', U2)).toEqual({ next: U2, refresh: true });
  });

  it('does not refresh on a duplicate SIGNED_IN for the same user (e.g. tab focus)', () => {
    expect(reduceAuthSync(U1, 'SIGNED_IN', U1)).toEqual({ next: U1, refresh: false });
  });

  it('refreshes on USER_UPDATED even when the id is unchanged', () => {
    expect(reduceAuthSync(U1, 'USER_UPDATED', U1)).toEqual({ next: U1, refresh: true });
  });

  it('does not refresh across a seed followed by repeated token rotations', () => {
    // Replays the exact loop: seed once, then the middleware keeps rotating the
    // cookie and the browser client keeps emitting TOKEN_REFRESHED. The old
    // component (refresh on TOKEN_REFRESHED) fired router.refresh() on every one
    // of these — this asserts the count is zero.
    let baseline = reduceAuthSync(undefined, 'INITIAL_SESSION', U1).next;
    let refreshes = 0;
    for (let i = 0; i < 5; i++) {
      const r = reduceAuthSync(baseline, 'TOKEN_REFRESHED', U1);
      baseline = r.next;
      if (r.refresh) refreshes++;
    }
    expect(refreshes).toBe(0);
  });
});
