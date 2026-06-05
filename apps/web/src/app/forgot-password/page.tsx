'use client';

import { useState } from 'react';
import { primaryButtonClass } from '@/components/primary-button';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';
import { useAlertReveal } from '@/components/use-alert-reveal';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const errorRef = useAlertReveal(error, Boolean(error));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="mx-auto max-w-sm space-y-6 py-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Reset your password</h1>
        <p className="text-fg/70 text-sm">
          Enter the email associated with your account and we&apos;ll send you a link to set a new
          password.
        </p>
      </div>

      {sent ? (
        <div
          role="status"
          className="border-primary/30 bg-primary/10 text-primary rounded-md border p-3 text-sm"
        >
          If an account exists for {email}, a reset link is on the way. Check your inbox (and spam
          folder).
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-border-base mt-1 w-full rounded-md border px-3 py-2"
            />
          </label>

          {error && (
            <div
              ref={errorRef}
              tabIndex={-1}
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 outline-none"
            >
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className={`${primaryButtonClass('md')} w-full`}>
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}

      <p className="text-fg/70 text-center text-sm">
        <Link href="/login" className="hover:underline">
          ← Back to sign in
        </Link>
      </p>
    </div>
  );
}
