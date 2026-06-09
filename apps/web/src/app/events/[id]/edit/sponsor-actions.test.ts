import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Gate-branch tests for the sponsor server actions (monetization audit SP-10).
 * The actions guard real money (the à-la-carte unlock) and the SP-1/SP-2 fix
 * (entitlement decoupled from content; removal ungated), so the branch
 * selection itself is worth pinning:
 *   - upsert: non-manager → unauthorized; Pro → save; free+paid → save;
 *     free+unpaid → `pro` flash with NO write (the money guard);
 *   - upsert: an unexpected error in the manage check propagates (NOT swallowed
 *     as "unauthorized" — the SP-8 re-throw);
 *   - remove: any manager can delete regardless of entitlement (SP-2), and only
 *     the content row is touched (SP-1).
 *
 * `redirect` is mocked to throw a tagged error so `flashTo` halts exactly like
 * the real Next runtime; the helper below recovers the target URL.
 */

const h = vi.hoisted(() => ({
  getEventDetail: vi.fn(),
  hasProBenefits: vi.fn(),
  requireSession: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  capture: vi.fn(),
  serverClient: { current: null as ReturnType<typeof makeClient> | null },
  adminClient: { current: null as ReturnType<typeof makeClient> | null },
}));

vi.mock('next/navigation', () => ({ redirect: h.redirect }));
vi.mock('next/cache', () => ({
  revalidatePath: (p: string) => h.revalidatePath(p),
  updateTag: (t: string) => h.updateTag(t),
}));
vi.mock('@/lib/handlers', () => ({
  handlers: { getEventDetail: { execute: h.getEventDetail } },
  analytics: { capture: h.capture },
}));
vi.mock('@/lib/admin', () => ({ hasProBenefits: h.hasProBenefits }));
vi.mock('@/lib/server-auth', () => ({ requireSession: h.requireSession }));
vi.mock('@/lib/supabase', () => ({ getServerSupabase: async () => h.serverClient.current }));
vi.mock('@/lib/supabase-admin', () => ({ getAdminSupabase: () => h.adminClient.current }));
vi.mock('@/lib/stripe', () => ({
  isStripeConfigured: () => true,
  getStripe: () => ({ checkout: { sessions: { create: vi.fn() } } }),
}));
vi.mock('@/lib/server-redirects', () => ({ buildOrigin: async () => 'https://test' }));
vi.mock('@/lib/pro', () => ({ SPONSOR_SLOT_UNLOCK_CENTS: 300 }));

import { upsertSponsorFromForm, removeSponsor } from './sponsor-actions';

type Op = { table: string; op: string; payload?: unknown };

/** Minimal chainable Supabase double: records terminal ops, resolves `data`/`error` by table. */
function makeClient(
  data: Record<string, unknown> = {},
  errors: Record<string, { message: string }> = {},
) {
  const ops: Op[] = [];
  function from(table: string) {
    const rec: Op = { table, op: 'select' };
    let pushed = false;
    const push = () => {
      if (!pushed) {
        pushed = true;
        ops.push(rec);
      }
    };
    const result = () => ({ data: data[table] ?? null, error: errors[table] ?? null });
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      upsert: (p: unknown) => {
        rec.op = 'upsert';
        rec.payload = p;
        push();
        return Promise.resolve(result());
      },
      delete: () => {
        rec.op = 'delete';
        push();
        return chain;
      },
      maybeSingle: () => {
        push();
        return Promise.resolve(result());
      },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
        push();
        return Promise.resolve(result()).then(res, rej);
      },
    };
    return chain;
  }
  return { from, ops };
}

/** Run an action that should redirect; return the flash URL it redirected to. */
async function redirectUrl(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith('REDIRECT:')) return msg.slice('REDIRECT:'.length);
    throw e;
  }
  throw new Error('expected the action to redirect');
}

function form(fields: Record<string, string> = { name: 'Acme' }): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireSession.mockResolvedValue({ user: { id: 'host-1', email: 'h@test' } });
  h.getEventDetail.mockResolvedValue({ canManage: true });
  h.hasProBenefits.mockResolvedValue(false);
  h.serverClient.current = makeClient();
  h.adminClient.current = makeClient(); // no event_sponsor_access row → unpaid
});

describe('upsertSponsorFromForm — gate', () => {
  it('redirects unauthorized and writes nothing for a non-manager', async () => {
    h.getEventDetail.mockResolvedValue({ canManage: false });
    const url = await redirectUrl(upsertSponsorFromForm('e1', '/events/e1/edit', form()));
    expect(url).toContain('sponsor=unauthorized');
    expect(h.serverClient.current!.ops.some((o) => o.op === 'upsert')).toBe(false);
  });

  it('saves (content-only) for a Pro host and evicts caches', async () => {
    h.hasProBenefits.mockResolvedValue(true);
    const url = await redirectUrl(upsertSponsorFromForm('e1', '/events/e1/edit', form()));
    expect(url).toContain('sponsor=saved');

    const upsert = h.serverClient.current!.ops.find((o) => o.op === 'upsert');
    expect(upsert?.table).toBe('event_sponsors');
    // SP-1: the content write carries no entitlement columns.
    expect(upsert?.payload).not.toHaveProperty('access_kind');
    expect(upsert?.payload).not.toHaveProperty('paid_at');
    expect(h.revalidatePath).toHaveBeenCalledWith('/events/e1/edit');
    expect(h.updateTag).toHaveBeenCalledWith('event:e1');
  });

  it('saves for a free host who already paid the à-la-carte unlock', async () => {
    h.adminClient.current = makeClient({
      event_sponsor_access: { paid_at: '2026-01-01T00:00:00Z' },
    });
    const url = await redirectUrl(upsertSponsorFromForm('e1', '/events/e1/edit', form()));
    expect(url).toContain('sponsor=saved');
    expect(h.serverClient.current!.ops.some((o) => o.op === 'upsert')).toBe(true);
  });

  it('blocks a free+unpaid host with the pro flash and writes nothing (money guard)', async () => {
    const url = await redirectUrl(upsertSponsorFromForm('e1', '/events/e1/edit', form()));
    expect(url).toContain('sponsor=pro');
    expect(h.serverClient.current!.ops.some((o) => o.op === 'upsert')).toBe(false);
  });

  it('re-throws an unexpected manage-check error instead of masking it (SP-8)', async () => {
    h.getEventDetail.mockRejectedValue(new Error('db down'));
    await expect(upsertSponsorFromForm('e1', '/events/e1/edit', form())).rejects.toThrow('db down');
    expect(h.redirect).not.toHaveBeenCalled();
  });
});

describe('removeSponsor — ungated (SP-2)', () => {
  it('lets a free+unpaid manager remove the sponsor (deletes content only)', async () => {
    // Not Pro, no paid unlock — the old code flashed `pro` here and stranded the host.
    const url = await redirectUrl(removeSponsor('e1', '/events/e1/edit'));
    expect(url).toContain('sponsor=removed');

    const del = h.serverClient.current!.ops.find((o) => o.op === 'delete');
    expect(del?.table).toBe('event_sponsors');
    // Entitlement check is never consulted for a removal.
    expect(h.hasProBenefits).not.toHaveBeenCalled();
    expect(h.revalidatePath).toHaveBeenCalledWith('/events/e1/edit');
    expect(h.updateTag).toHaveBeenCalledWith('event:e1');
  });

  it('refuses removal for a non-manager', async () => {
    h.getEventDetail.mockResolvedValue({ canManage: false });
    const url = await redirectUrl(removeSponsor('e1', '/events/e1/edit'));
    expect(url).toContain('sponsor=unauthorized');
    expect(h.serverClient.current!.ops.some((o) => o.op === 'delete')).toBe(false);
  });
});
