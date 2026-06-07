'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';
import { primaryButtonClass } from '@/components/primary-button';

/**
 * The right-rail actions on `/community`: the "Submit a listing" CTA (sign-in
 * link when logged out) and the platform-admin "Import listings" link. Lives in
 * a client island so the listing page can stay cookie-free + CDN-cacheable
 * (performance audit P3 #17). Defaults to the logged-out state — which is what
 * the cached HTML anonymous visitors see — then resolves the real session after
 * hydration.
 */
export function CommunitySubmitActions() {
  const [state, setState] = useState<{ signedIn: boolean; admin: boolean }>({
    signedIn: false,
    admin: false,
  });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    async function resolve() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user || user.is_anonymous) {
        if (!cancelled) setState({ signedIn: false, admin: false });
        return;
      }
      // Own-profile read; RLS allows the viewer to read their own `is_platform_admin`.
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_platform_admin')
        .eq('id', user.id)
        .maybeSingle();
      const admin = !!(profile as { is_platform_admin?: boolean } | null)?.is_platform_admin;
      if (!cancelled) setState({ signedIn: true, admin });
    }
    void resolve();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void resolve();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      {state.signedIn ? (
        <Link href="/community/new" className={primaryButtonClass('md')}>
          Submit a listing
        </Link>
      ) : (
        <Link
          href={{ pathname: '/login', query: { next: '/community/new' } }}
          className={primaryButtonClass('md')}
        >
          Sign in to submit
        </Link>
      )}
      {state.admin && (
        <Link href="/admin/community-import" className="text-primary text-sm hover:underline">
          Import listings (admin)
        </Link>
      )}
    </div>
  );
}
