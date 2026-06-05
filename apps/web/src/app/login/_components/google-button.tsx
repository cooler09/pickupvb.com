'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';
import { Alert } from '@/components/alert';
import { useAlertReveal } from '@/components/use-alert-reveal';

/**
 * Self-contained "Continue with Google" button. Initiates the OAuth flow
 * and surfaces any kickoff error inline. The actual sign-in completes via
 * the /auth/callback route after the redirect round-trip.
 */
export function GoogleButton() {
  const [error, setError] = useState<string | null>(null);
  const errorRef = useAlertReveal(error, Boolean(error));

  async function signIn() {
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={signIn}
        className="border-border-base hover:bg-fg/5 w-full rounded-md border px-4 py-2 font-medium"
      >
        Continue with Google
      </button>
      {error && (
        <div ref={errorRef} tabIndex={-1} className="outline-none">
          <Alert variant="error">{error}</Alert>
        </div>
      )}
    </div>
  );
}
