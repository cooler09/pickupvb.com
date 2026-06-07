import { Suspense } from 'react';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next/types';
import { BreadcrumbJsonLd } from '@/app/_components/breadcrumb-jsonld';
import {
  communityListingExists,
  loadCommunityDetailPublic,
  resolveClaimedEventTarget,
} from './community-detail-cache';
import { CommunityListingJsonLd } from './_components/community-listing-jsonld';
import { CommunityListingArticle } from './_components/community-listing-article';
import { CommunityNoticeBannerClient } from './_components/community-notice-banner-client';
import {
  CommunityRestrictedView,
  CommunityViewerActions,
  CommunityViewerAlerts,
  CommunityViewerProvider,
} from './_components/community-viewer-chrome';

type PageProps = {
  params: Promise<{ slug: string }>;
};

// ISR: the public (viewer-`null`) shell is identical for every logged-out
// visitor + crawler, so serve it from the edge and refresh every 60s. The page
// reads no `cookies()` or `searchParams` — viewer-conditional chrome resolves in
// a client island (`CommunityViewerProvider`) and the `?notice=` flash banner in
// a client `useSearchParams` component — so the route stays cacheable. Mutating
// actions evict the data layer via `updateTag(communityListingCacheTag(slug))`.
// Performance audit P2 #16.
export const revalidate = 60;

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { slug } = await props.params;
  const detail = await loadCommunityDetailPublic(slug);
  if (!detail) return { title: 'Community listing not found' };
  const place = [detail.location?.city, detail.location?.region].filter(Boolean).join(', ');
  const description = detail.description?.trim()
    ? detail.description.slice(0, 200)
    : `${place ? `${place} · ` : ''}Community-submitted volleyball event on PickupVB.`;
  return {
    title: `${detail.title} · Community listing`,
    description,
    alternates: { canonical: `/community/${detail.slug}` },
    openGraph: {
      title: detail.title,
      description,
      url: `/community/${detail.slug}`,
      type: 'article',
    },
    robots:
      detail.status === 'active' || detail.status === 'claim_pending'
        ? undefined
        : { index: false, follow: false },
  };
}

export default async function CommunityListingDetailPage(props: PageProps) {
  const { slug } = await props.params;
  const detail = await loadCommunityDetailPublic(slug);

  // A claimed listing exists only to funnel visitors to the on-platform event it
  // was linked to. Permanently redirect so old listing URLs — and any indexed
  // copies — land on the event page instead of a dead-end pointing at the
  // external site. Viewer-independent, and the slug is resolved on the admin
  // client, so this stays cookie-free (and thus cacheable).
  if (detail?.status === 'claimed' && detail.claimedEventId) {
    permanentRedirect(`/events/${await resolveClaimedEventTarget(detail.claimedEventId)}`);
  }

  // The public (viewer-`null`) read returns `null` for both a genuinely-missing
  // slug and a hidden/removed listing (only a manager may load those). Probe
  // existence cookielessly: missing → a real 404; otherwise render the manager
  // island, which resolves the viewer client-side and shows the listing to a
  // manager (or a generic "not available" notice to everyone else).
  if (!detail) {
    if (!(await communityListingExists(slug))) notFound();
    return (
      <article className="mx-auto max-w-3xl space-y-6">
        <nav className="text-muted text-sm">
          <Link href="/community" className="hover:text-primary">
            ← All community listings
          </Link>
        </nav>
        <CommunityViewerProvider slug={slug}>
          <Suspense fallback={null}>
            <CommunityNoticeBannerClient />
          </Suspense>
          <CommunityRestrictedView />
        </CommunityViewerProvider>
      </article>
    );
  }

  const isIndexable = detail.status === 'active' || detail.status === 'claim_pending';

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      {isIndexable && (
        <>
          <BreadcrumbJsonLd
            trail={[
              { name: 'Community', path: '/community' },
              { name: detail.title, path: `/community/${detail.slug}` },
            ]}
          />
          <CommunityListingJsonLd
            title={detail.title}
            slug={detail.slug}
            startsAt={detail.startsAt}
            endsAt={detail.endsAt}
            location={detail.location}
          />
        </>
      )}
      <nav className="text-muted text-sm">
        <Link href="/community" className="hover:text-primary">
          ← All community listings
        </Link>
      </nav>

      <CommunityViewerProvider slug={detail.slug}>
        <Suspense fallback={null}>
          <CommunityNoticeBannerClient />
        </Suspense>
        <CommunityViewerAlerts />
        <CommunityListingArticle detail={detail} />
        <CommunityViewerActions />
      </CommunityViewerProvider>
    </article>
  );
}
