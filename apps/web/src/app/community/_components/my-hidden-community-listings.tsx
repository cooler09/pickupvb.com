'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';
import type { CommunityListingSummary } from '@pickupvb/domain';
import { getMyHiddenCommunityListings } from '../my-hidden-listings-actions';
import { CommunityListingCard } from './community-listing-card';

/**
 * Recovery strip for a signed-in submitter's own `hidden` listings. The
 * `/community` list renders publicly (anon, viewer-`null`) so it can be
 * CDN-cached, which means a submitter's auto-hidden listing no longer shows up
 * inline — and auto-hide (a DB trigger) sends no notification, so this is the
 * only in-app path back to it. Resolves the session client-side, fetches via a
 * server action, and renders nothing for logged-out viewers or when there are
 * none (performance audit P3 #17).
 */
export function MyHiddenCommunityListings() {
  const [listings, setListings] = useState<CommunityListingSummary[] | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    async function load() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user || user.is_anonymous) {
        if (!cancelled) setListings([]);
        return;
      }
      const hidden = await getMyHiddenCommunityListings();
      if (!cancelled) setListings(hidden);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!listings || listings.length === 0) return null;

  return (
    <section className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Your hidden listings
        </h2>
        <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
          These are hidden from everyone else — either you hid them, or they were auto-hidden after
          multiple reports. Open one to review or unhide it.
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {listings.map((l) => (
          <CommunityListingCard key={l.id} listing={l} />
        ))}
      </ul>
    </section>
  );
}
