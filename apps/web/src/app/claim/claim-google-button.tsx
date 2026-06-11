'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';
import { Alert } from '@/components/alert';
import { useAlertReveal } from '@/components/use-alert-reveal';

/**
 * One-click claim: link a Google identity to the CURRENT anonymous user via
 * `linkIdentity` (NOT `signInWithOAuth`, which would start a fresh sign-in and
 * orphan the guest's signups). This skips the email → confirm → set-password
 * round-trip entirely — the guest's existing signups carry over and they land
 * as a full account in one redirect. Requires Manual Linking enabled in the
 * Supabase dashboard. See docs/audits/anonymous-claim.md AC-7.
 */
export function ClaimGoogleButton({ next }: { next?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const errorRef = useAlertReveal(error, Boolean(error));

  async function linkGoogle() {
    setError(null);
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    // After the OAuth round-trip Supabase redirects here with a `code`;
    // /auth/callback exchanges it (the session is now non-anonymous) and
    // forwards to `next`. Default to /profile — the account is complete.
    const dest = next ?? '/profile';
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(dest)}`;
    const { error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo },
    });
    // We only reach here if kickoff failed — success navigates away.
    if (error) {
      setLoading(false);
      setError(
        /already.*linked|identity.*(exist|registered)|already.*in use/i.test(error.message)
          ? "That Google account is already linked to another PickupVB account. Sign in with it instead — your guest signups won't merge automatically."
          : error.message,
      );
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={linkGoogle}
        disabled={loading}
        className="border-border-base hover:bg-fg/5 w-full rounded-md border px-4 py-2 font-medium disabled:opacity-50"
      >
        {loading ? 'Connecting…' : 'Continue with Google'}
      </button>
      {error && (
        <div ref={errorRef} tabIndex={-1} className="outline-none">
          <Alert variant="error">{error}</Alert>
        </div>
      )}
    </div>
  );
}
