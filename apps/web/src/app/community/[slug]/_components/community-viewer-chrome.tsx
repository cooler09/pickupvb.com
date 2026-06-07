'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@pickupvb/supabase/browser';
import { getCommunityViewerChrome } from '../community-viewer-actions';
import type { CommunityViewerChromeModel } from '../_loaders/load-community-detail-page';
import { CommunityListingArticle } from './community-listing-article';
import {
  ClaimSection,
  ManageSection,
  PendingClaimReview,
  ReportSection,
} from './community-action-sections';

type ViewerState =
  | { phase: 'loading' }
  | { phase: 'anon' }
  | { phase: 'ready'; model: CommunityViewerChromeModel | null };

const ViewerContext = createContext<ViewerState>({ phase: 'loading' });

/**
 * Resolves the viewer-conditional chrome for a community listing once, after
 * hydration, and shares it via context so the surrounding page can render a
 * cookie-free, ISR-cacheable server shell (performance audit P2 #16). Mirrors
 * the `<TeamViewerChrome />` / `useEventManageCaps` pattern (Bundle 25 / P2 #14):
 * one `auth.getUser()` round-trip, then — only for a real (non-anonymous)
 * session — one `getCommunityViewerChrome` server action.
 *
 * Anonymous visitors (the cacheable target — crawlers, share unfurls) resolve to
 * `phase: 'anon'` and trigger no server action.
 */
export function CommunityViewerProvider({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<ViewerState>({ phase: 'loading' });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    async function load() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user || user.is_anonymous) {
        if (!cancelled) setState({ phase: 'anon' });
        return;
      }
      const model = await getCommunityViewerChrome(slug);
      if (!cancelled) setState({ phase: 'ready', model });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return <ViewerContext.Provider value={state}>{children}</ViewerContext.Provider>;
}

function useViewer(): ViewerState {
  return useContext(ViewerContext);
}

/** Top-of-page status alerts (pending-claim review, claimant-awaiting banner). */
export function CommunityViewerAlerts() {
  const state = useViewer();
  if (state.phase !== 'ready' || !state.model) return null;
  const { detail, pendingClaim, viewerIsClaimant } = state.model;
  return (
    <>
      {pendingClaim && detail.canManage && (
        <PendingClaimReview detail={detail} pendingClaim={pendingClaim} />
      )}
      {viewerIsClaimant && !detail.canManage && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Your claim is awaiting review by the original submitter or a platform admin. Until
          it&rsquo;s approved, the listing still links to the external page.
        </div>
      )}
    </>
  );
}

/** Bottom-of-page action panels (claim / report / manage). */
export function CommunityViewerActions() {
  const state = useViewer();
  if (state.phase !== 'ready' || !state.model) return null;
  const { detail, showClaimSection, eligibleEvents, claimableEvents } = state.model;
  return (
    <>
      {showClaimSection && (
        <ClaimSection
          detail={detail}
          eligibleEvents={eligibleEvents}
          claimableEvents={claimableEvents}
        />
      )}
      {detail.status === 'active' && !detail.canManage && <ReportSection detail={detail} />}
      {detail.canManage && <ManageSection detail={detail} />}
    </>
  );
}

/**
 * Body for a listing that isn't publicly visible (hidden / removed). Only a
 * manager may see its contents; everyone else (and logged-out visitors) gets a
 * generic "not available" notice — there's no server-side viewer read on this
 * page, so the gate is resolved here from the viewer-scoped model. These
 * statuses are `noindex`, so the soft state (vs a hard 404 for a non-manager) is
 * SEO-immaterial.
 */
export function CommunityRestrictedView() {
  const state = useViewer();
  if (state.phase === 'loading') return null;
  if (state.phase === 'anon' || !state.model) {
    return (
      <p className="bg-highlight/30 text-muted rounded-md p-6 text-center text-sm">
        This listing isn&rsquo;t available. It may have been hidden or removed, or you may not have
        access to it.
      </p>
    );
  }
  const { detail, showHiddenWarning } = state.model;
  return (
    <>
      {showHiddenWarning && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          This listing is currently <strong>{detail.status}</strong> and not visible to the public.
          {detail.reportCount > 0 && (
            <>
              {' '}
              It received <strong>{detail.reportCount}</strong> report
              {detail.reportCount === 1 ? '' : 's'}.
            </>
          )}
        </div>
      )}
      <CommunityListingArticle detail={detail} />
      {detail.canManage && <ManageSection detail={detail} />}
    </>
  );
}
