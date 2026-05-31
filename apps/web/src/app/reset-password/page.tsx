'use client';

import { useEffect, useState } from 'react';
import { primaryButtonClass } from '@/components/primary-button';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';
import { Alert } from '@/components/alert';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      setAuthed(Boolean(data.user));
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
      router.push('/events');
      router.refresh();
    }, 1500);
  }

  if (!ready) {
    return <div className="text-fg/70 mx-auto max-w-sm py-8 text-sm">Loading…</div>;
  }

  if (!authed) {
    return (
      <div className="mx-auto max-w-sm space-y-4 py-8">
        <h1 className="text-2xl font-bold">Reset link expired</h1>
        <p className="text-fg/70 text-sm">
          This password-reset link is no longer valid. Request a new one to continue.
        </p>
        <Link href="/forgot-password" className={primaryButtonClass('md')}>
          Request new link
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-6 py-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Choose a new password</h1>
        <p className="text-fg/70 text-sm">Pick something at least 8 characters long.</p>
      </div>

      {done ? (
        <div
          role="status"
          className="border-primary/30 bg-primary/10 text-primary rounded-md border p-3 text-sm"
        >
          Password updated. Redirecting…
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

          {error && <Alert variant="error">{error}</Alert>}

          <button type="submit" disabled={loading} className={`${primaryButtonClass('md')} w-full`}>
            {loading ? 'Updating…' : 'Update password'}
          </button>
        </form>
      )}
    </div>
  );
}
