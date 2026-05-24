'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';

/**
 * Renders the "+ New group" CTA only when the viewer is signed in (and not
 * anonymous). Lives in a client component so the surrounding listing page
 * can stay ISR-cacheable — the page body must not call `cookies()` to keep
 * the route static for anonymous traffic.
 *
 * Trade-off: brief render gap before hydration figures out the session.
 * That's acceptable for a button that only exists for authenticated users.
 */
export function NewGroupButton() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setSignedIn(!!data.user && !data.user.is_anonymous);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session?.user && !session.user.is_anonymous);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!signedIn) return null;
  return (
    <Link
      href="/groups/new"
      className="bg-primary hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm font-medium text-white"
    >
      + New group
    </Link>
  );
}
