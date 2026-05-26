'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';

/**
 * Keeps the App Router layout in sync with Supabase auth changes that happen
 * in the browser after the current RSC payload was rendered.
 */
export function AuthStateSync() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === 'SIGNED_IN' ||
        event === 'SIGNED_OUT' ||
        event === 'USER_UPDATED' ||
        event === 'TOKEN_REFRESHED'
      ) {
        router.refresh();
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [router]);

  return null;
}
