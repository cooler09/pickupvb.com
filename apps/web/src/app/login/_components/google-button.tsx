'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';
import { Alert } from '@/components/alert';

/**
 * Self-contained "Continue with Google" button. Initiates the OAuth flow
 * and surfaces any kickoff error inline. The actual sign-in completes via
 * the /auth/callback route after the redirect round-trip.
 */
export function GoogleButton() {
    const [error, setError] = useState<string | null>(null);

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
                className="w-full rounded-md border border-border-base px-4 py-2 font-medium hover:bg-fg/5"
            >
                Continue with Google
            </button>
            {error && <Alert variant="error">{error}</Alert>}
        </div>
    );
}
