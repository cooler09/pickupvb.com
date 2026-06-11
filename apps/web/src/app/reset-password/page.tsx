'use client';

import { useEffect, useState } from 'react';
import type { Route } from 'next';
import { primaryButtonClass } from '@/components/primary-button';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';
import { Alert } from '@/components/alert';
import { useAlertReveal } from '@/components/use-alert-reveal';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  // `from=claim` is threaded by the anonymous-claim flow (claim/actions.ts):
  // this is the user's FIRST password, not a reset, so the copy + expired-link
  // recovery differ. See docs/audits/anonymous-claim.md AC-3.
  const [fromClaim, setFromClaim] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const errorRef = useAlertReveal(error, Boolean(error));

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const claim = new URLSearchParams(window.location.search).get('from') === 'claim';
    supabase.auth.getUser().then(({ data }) => {
      setAuthed(Boolean(data.user));
      setFromClaim(claim);
      setReady(true);
    });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    setTimeout(() => {
      // Honor the `next` threaded from the claim flow (e.g. /events/new), so a
      // user who came from a host/team gate lands back there after setting a
      // password. Read from the URL at submit time to avoid a useSearchParams
      // Suspense boundary. Same-origin relative only (mirrors /auth/callback).
      const raw = new URLSearchParams(window.location.search).get('next');
      const target = raw && /^\/(?![/\\])/.test(raw) ? (raw as Route) : ('/events' as Route);
      router.push(target);
      router.refresh();
    }, 1500);
  }

  if (!ready) {
    return <div className="text-fg/70 mx-auto max-w-sm py-8 text-sm">Loading…</div>;
  }

  if (!authed) {
    // A claim confirmation link has no password to "reset" and often no email
    // on file to recover — send them back to restart /claim, not /forgot-password.
    return (
      <div className="mx-auto max-w-sm space-y-4 py-8">
        <h1 className="text-headline-sm font-bold">
          {fromClaim ? 'Confirmation link expired' : 'Reset link expired'}
        </h1>
        <p className="text-fg/70 text-sm">
          {fromClaim
            ? 'This confirmation link is no longer valid. Restart creating your account to continue.'
            : 'This password-reset link is no longer valid. Request a new one to continue.'}
        </p>
        <Link href={fromClaim ? '/claim' : '/forgot-password'} className={primaryButtonClass('md')}>
          {fromClaim ? 'Finish creating your account' : 'Request new link'}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-6 py-8">
      <div className="space-y-2">
        <h1 className="text-headline-sm font-bold">
          {fromClaim ? 'Set your password' : 'Choose a new password'}
        </h1>
        <p className="text-fg/70 text-sm">
          {fromClaim
            ? 'Last step — pick something at least 8 characters long to finish creating your account.'
            : 'Pick something at least 8 characters long.'}
        </p>
      </div>

      {done ? (
        <div
          role="status"
          className="border-primary/30 bg-primary/10 text-primary rounded-md border p-3 text-sm"
        >
          {fromClaim ? 'Account created. Redirecting…' : 'Password updated. Redirecting…'}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium">New password</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-border-base mt-1 w-full rounded-md border px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Confirm new password</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="border-border-base mt-1 w-full rounded-md border px-3 py-2"
            />
          </label>

          {error && (
            <div ref={errorRef} tabIndex={-1} className="outline-none">
              <Alert variant="error">{error}</Alert>
            </div>
          )}

          <button type="submit" disabled={loading} className={`${primaryButtonClass('md')} w-full`}>
            {loading
              ? fromClaim
                ? 'Setting…'
                : 'Updating…'
              : fromClaim
                ? 'Set password'
                : 'Update password'}
          </button>
        </form>
      )}
    </div>
  );
}
