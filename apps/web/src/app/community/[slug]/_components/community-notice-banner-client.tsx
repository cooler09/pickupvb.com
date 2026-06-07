'use client';

import { useSearchParams } from 'next/navigation';
import { CommunityNoticeBanner } from './community-notice-banner';

/**
 * Reads the `?notice=` flash param client-side so the listing page itself never
 * touches `searchParams` server-side — that would force the route dynamic and
 * defeat the ISR shell (performance audit P2 #16). Must be rendered inside a
 * `<Suspense>` boundary (Next requirement for `useSearchParams` on a statically
 * rendered route); the page wraps it with `fallback={null}`.
 */
export function CommunityNoticeBannerClient() {
  const code = useSearchParams().get('notice') ?? undefined;
  return <CommunityNoticeBanner code={code} />;
}
