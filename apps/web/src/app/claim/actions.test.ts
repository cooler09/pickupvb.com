import { describe, it, expect, vi, beforeEach } from 'vitest';

// Anonymous-account claim flow. We isolate the action from Supabase auth, the
// rate limiter, the email-redirect builder, and the Next redirect/revalidate
// primitives so we can pin the branches that have no e2e coverage yet
// (the full claim e2e is still test.fixme — see docs/audits/anonymous-claim.md
// AC-5): input validation, the not-anon / no-session guards, the open-redirect
// sanitization of `next`, and the friendly "already registered" mapping.

vi.mock('@/lib/form-data', () => ({
  field: (fd: FormData, name: string) => String(fd.get(name) ?? ''),
}));

vi.mock('@/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn() } }));

const consumeRateLimitMock = vi.fn();
vi.mock('@/lib/rate-limit', () => ({
  consumeRateLimit: (args: unknown) => consumeRateLimitMock(args),
  getClientIp: async () => '1.2.3.4',
  rateLimitKey: (scope: string, dim: string, val: string) => `${scope}:${dim}:${val}`,
}));

const buildClaimEmailRedirectMock = vi.fn();
vi.mock('@/lib/server-redirects', () => ({
  buildClaimEmailRedirect: (next?: string) => buildClaimEmailRedirectMock(next),
}));

const getViewerMock = vi.fn();
vi.mock('@/lib/server-auth', () => ({ getViewer: () => getViewerMock() }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// `redirect` throws in Next; model that so terminal paths are observable.
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { claimAccount } from './actions';

const updateUserMock = vi.fn();
const profileEqMock = vi.fn().mockResolvedValue({ error: null });
const fakeSupabase = {
  auth: { updateUser: updateUserMock },
  from: vi.fn(() => ({ update: vi.fn(() => ({ eq: profileEqMock })) })),
};

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe('claimAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeRateLimitMock.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    buildClaimEmailRedirectMock.mockResolvedValue('https://app/auth/callback?next=%2F');
    updateUserMock.mockResolvedValue({ error: null });
    getViewerMock.mockResolvedValue({
      supabase: fakeSupabase,
      user: { id: 'u1', email: null },
      isAnonymous: true,
    });
  });

  it('rejects an invalid email before touching the session', async () => {
    const res = await claimAccount({}, form({ email: 'not-an-email' }));
    expect(res.fieldErrors?.email).toBeTruthy();
    expect(getViewerMock).not.toHaveBeenCalled();
  });

  it('errors when there is no active session', async () => {
    getViewerMock.mockResolvedValue(null);
    const res = await claimAccount({}, form({ email: 'greg@example.com' }));
    expect(res.error).toMatch(/no active session/i);
  });

  it('errors when the viewer is already a permanent account', async () => {
    getViewerMock.mockResolvedValue({
      supabase: fakeSupabase,
      user: { id: 'u1', email: 'greg@example.com' },
      isAnonymous: false,
    });
    const res = await claimAccount({}, form({ email: 'greg@example.com' }));
    expect(res.error).toMatch(/already permanent/i);
  });

  it('threads a same-origin relative `next` into the email redirect', async () => {
    await expect(
      claimAccount({}, form({ email: 'greg@example.com', next: '/events/new' })),
    ).rejects.toThrow(/^REDIRECT:\/claim\/check-email/);
    expect(buildClaimEmailRedirectMock).toHaveBeenCalledWith('/events/new');
  });

  it('rejects an off-origin `next` (open-redirect guard) — //evil.com', async () => {
    await expect(
      claimAccount({}, form({ email: 'greg@example.com', next: '//evil.com' })),
    ).rejects.toThrow(/^REDIRECT:/);
    expect(buildClaimEmailRedirectMock).toHaveBeenCalledWith(undefined);
  });

  it('rejects a backslash-prefixed `next` (open-redirect guard) — /\\evil.com', async () => {
    await expect(
      claimAccount({}, form({ email: 'greg@example.com', next: '/\\evil.com' })),
    ).rejects.toThrow(/^REDIRECT:/);
    expect(buildClaimEmailRedirectMock).toHaveBeenCalledWith(undefined);
  });

  it('carries `next` through to the check-email redirect', async () => {
    await expect(
      claimAccount({}, form({ email: 'greg@example.com', next: '/events/new' })),
    ).rejects.toThrow('REDIRECT:/claim/check-email?to=greg%40example.com&next=%2Fevents%2Fnew');
  });

  it('blocks when the rate limiter is exhausted, before sending the email', async () => {
    consumeRateLimitMock.mockResolvedValue({ allowed: false, retryAfterSeconds: 120 });
    const res = await claimAccount({}, form({ email: 'greg@example.com' }));
    expect(res.error).toMatch(/too many attempts/i);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it('maps an "already registered" Supabase error to friendly sign-in copy', async () => {
    updateUserMock.mockResolvedValue({
      error: { message: 'A user with this email address has already been registered' },
    });
    const res = await claimAccount({}, form({ email: 'greg@example.com' }));
    expect(res.error).toMatch(/already linked to an account/i);
    expect(res.error).not.toMatch(/already been registered/i);
  });

  it('keeps an unknown Supabase email error generic (no raw message leak)', async () => {
    updateUserMock.mockResolvedValue({ error: { message: 'pgcode 500 internal boom' } });
    const res = await claimAccount({}, form({ email: 'greg@example.com' }));
    expect(res.error).toMatch(/couldn't send the confirmation email/i);
    expect(res.error).not.toMatch(/boom/);
  });
});
