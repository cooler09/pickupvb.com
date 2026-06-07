import Link from 'next/link';
import { primaryButtonClass } from '@/components/primary-button';
import type { Metadata } from 'next/types';
import { SURFACE_LABEL, FORMAT_LABEL, SKILL_LABEL } from '@/lib/enum-labels';
import { LocalDateTime } from '@/components/local-datetime';
import { getCurrentUser } from '@/lib/server-auth';
import { externalLinkHref } from '@/lib/external-link';
import { BreadcrumbJsonLd } from '@/app/_components/breadcrumb-jsonld';
import { loadCommunityDetailPublic } from './community-detail-cache';
import { CommunityListingJsonLd } from './_components/community-listing-jsonld';
import { CommunityNoticeBanner } from './_components/community-notice-banner';
import {
  ClaimSection,
  ManageSection,
  PendingClaimReview,
  ReportSection,
} from './_components/community-action-sections';
import { loadCommunityDetailPage } from './_loaders/load-community-detail-page';

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

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
  const searchParams = await props.searchParams;
  const { user } = await getCurrentUser();
  const {
    detail,
    isIndexable,
    notice,
    place,
    hostLabel,
    showHiddenWarning,
    pendingClaim,
    viewerIsClaimant,
    showClaimSection,
    eligibleEvents,
    claimableEvents,
  } = await loadCommunityDetailPage(slug, searchParams, user);

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

      <CommunityNoticeBanner code={notice} />

      {pendingClaim && detail.canManage && (
        <PendingClaimReview detail={detail} pendingClaim={pendingClaim} />
      )}

      {viewerIsClaimant && !detail.canManage && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Your claim is awaiting review by the original submitter or a platform admin. Until
          it&rsquo;s approved, the listing still links to the external page.
        </div>
      )}

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

      <header className="space-y-2">
        <p className="text-xs font-semibold tracking-wide text-amber-600 uppercase dark:text-amber-400">
          Community listing
        </p>
        <h1 className="text-3xl font-bold">{detail.title}</h1>
        <p className="text-muted text-sm">Submitted by {detail.submitter.displayName}</p>
      </header>

      <div className="border-border-base bg-surface rounded-shape-sm space-y-1 border p-4">
        <p className="text-fg text-sm font-semibold">When</p>
        <p className="text-sm">
          <LocalDateTime iso={detail.startsAt} variant="eventDateLong" timeZone={detail.timeZone} />{' '}
          at <LocalDateTime iso={detail.startsAt} variant="time" timeZone={detail.timeZone} />
          {detail.endsAt && (
            <>
              {' '}
              &ndash;{' '}
              <LocalDateTime iso={detail.endsAt} variant="time" timeZone={detail.timeZone} />
            </>
          )}
        </p>
        {place && (
          <>
            <p className="text-fg mt-3 text-sm font-semibold">Where</p>
            <p className="text-sm">{place}</p>
          </>
        )}
        {(detail.surface || detail.format || detail.skillLevel) && (
          <div className="mt-3 flex flex-wrap gap-1 text-[11px]">
            {detail.surface && (
              <span className="bg-fg/5 rounded px-1.5 py-0.5">
                {SURFACE_LABEL[detail.surface] ?? detail.surface}
              </span>
            )}
            {detail.format && (
              <span className="bg-fg/5 rounded px-1.5 py-0.5">
                {FORMAT_LABEL[detail.format] ?? detail.format}
              </span>
            )}
            {detail.skillLevel && (
              <span className="bg-fg/5 rounded px-1.5 py-0.5">
                {SKILL_LABEL[detail.skillLevel] ?? detail.skillLevel}
              </span>
            )}
          </div>
        )}
      </div>

      {detail.description && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Details</h2>
          <p className="text-fg/90 text-sm whitespace-pre-wrap">{detail.description}</p>
        </section>
      )}

      <section className="border-primary/40 bg-primary/5 rounded-shape-sm space-y-3 border-2 p-4">
        <p className="text-sm">
          RSVP and full details are on the external site ({hostLabel}). PickupVB doesn&rsquo;t
          handle signups for community listings.
        </p>
        <a
          href={externalLinkHref(detail.externalUrl)}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className={`${primaryButtonClass('md')} gap-2`}
        >
          Open on {hostLabel} →
        </a>
        <p className="text-muted text-xs break-all">{detail.externalUrl}</p>
      </section>

      {showClaimSection && (
        <ClaimSection
          detail={detail}
          eligibleEvents={eligibleEvents}
          claimableEvents={claimableEvents}
        />
      )}

      {user && !detail.canManage && detail.status === 'active' && <ReportSection detail={detail} />}

      {detail.canManage && <ManageSection detail={detail} />}
    </article>
  );
}
