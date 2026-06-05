import Link from 'next/link';
import {
  primaryButtonClass,
  neutralButtonClass,
  errorTonalButtonClass,
} from '@/components/primary-button';
import type { Route } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next/types';
import { GetCommunityListingDetailQuery } from '@pickupvb/application';
import { NotFoundError } from '@pickupvb/domain';
import { SupabaseProfileRepository } from '@pickupvb/infrastructure';
import { SURFACE_LABEL, FORMAT_LABEL, SKILL_LABEL } from '@/lib/enum-labels';
import { LocalDateTime } from '@/components/local-datetime';
import { SubmitButton } from '@/components/submit-button';
import { handlers } from '@/lib/handlers';
import { getCurrentUser } from '@/lib/server-auth';
import { getServerSupabase } from '@/lib/supabase';
import { loadVisibleHostedEvents } from '@/components/hosted-events-list';
import { externalLinkHref } from '@/lib/external-link';
import { BreadcrumbJsonLd } from '@/app/_components/breadcrumb-jsonld';
import { loadCommunityDetailPublic } from './community-detail-cache';
import { CommunityListingJsonLd } from './_components/community-listing-jsonld';
import {
  approveListingClaimFromForm,
  claimListingFromForm,
  deleteListingFromForm,
  hideListingFromForm,
  rejectListingClaimFromForm,
  reportListingFromForm,
  unhideListingFromForm,
} from './listing-actions';

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function loadDetail(slug: string, viewerId: string | null) {
  try {
    return await handlers.getCommunityListingDetail.execute(
      new GetCommunityListingDetailQuery(slug, viewerId),
    );
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}

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

function noticeBanner(code: string | undefined): React.ReactNode {
  if (!code) return null;
  const messages: Record<string, { tone: 'ok' | 'warn' | 'err'; text: string }> = {
    reported: {
      tone: 'ok',
      text: 'Thanks — your report was recorded. We may hide this listing if more reports come in.',
    },
    already: { tone: 'warn', text: "You've already reported this listing." },
    hidden: { tone: 'ok', text: 'Listing hidden. Only you and platform admins can see it now.' },
    unhidden: { tone: 'ok', text: 'Listing restored.' },
    updated: { tone: 'ok', text: 'Listing updated.' },
    claimed: {
      tone: 'ok',
      text: 'Listing claimed and linked to your event.',
    },
    claimproposed: {
      tone: 'ok',
      text: 'Claim submitted. The original submitter (or a platform admin) will review it before the listing redirects to your event.',
    },
    claimapproved: {
      tone: 'ok',
      text: 'Claim approved. The listing now points to the PickupVB event.',
    },
    claimrejected: {
      tone: 'ok',
      text: 'Claim rejected. The listing is active again.',
    },
    claimfail: {
      tone: 'err',
      text: "That event couldn't be linked. The PickupVB event must be on the same day and in the same city as this listing, and you must host (or co-host) it.",
    },
    notallow: { tone: 'err', text: "You don't have permission to do that." },
    notfound: { tone: 'err', text: 'This listing no longer exists.' },
    error: { tone: 'err', text: 'Something went wrong. Please try again.' },
  };
  const m = messages[code];
  if (!m) return null;
  const toneClass =
    m.tone === 'ok'
      ? 'border-green-200 bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-200'
      : m.tone === 'warn'
        ? 'border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
        : 'border-red-200 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200';
  return (
    <div
      role={m.tone === 'err' ? 'alert' : 'status'}
      className={`rounded-md border p-3 text-sm ${toneClass}`}
    >
      {m.text}
    </div>
  );
}

function externalHostFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Format a `Date` as `YYYY-MM-DD` in the given IANA timezone, for "same
 * calendar day" comparisons. Falls back to UTC if the runtime rejects the
 * zone. Mirrors the application-layer helper used by
 * `ClaimCommunityListingHandler`.
 */
function formatDayKey(d: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export default async function CommunityListingDetailPage(props: PageProps) {
  const { slug } = await props.params;
  const searchParams = await props.searchParams;
  const { user } = await getCurrentUser();
  // Anonymous viewers (and crawlers) read the shared 60s-cached public model;
  // logged-in viewers get a fresh viewer-scoped read (canManage / hasReported /
  // own-hidden). See community-detail-cache.ts (audit CL-12).
  const detail = user ? await loadDetail(slug, user.id) : await loadCommunityDetailPublic(slug);
  if (!detail) notFound();

  // A claimed listing exists only to funnel visitors to the on-platform event
  // it was linked to (the whole point of the claim flow). Permanently redirect
  // to that event so old listing URLs — and any search-indexed copies — land on
  // the event page instead of a dead-end community page still pointing at the
  // external site. The FK is `on delete set null`, so a non-null
  // `claimedEventId` here means the event still exists; resolve its slug (fall
  // back to the id, which the events route also accepts).
  if (detail.status === 'claimed' && detail.claimedEventId) {
    const sb = await getServerSupabase();
    const { data: ev } = await sb
      .from('events')
      .select('slug')
      .eq('id', detail.claimedEventId)
      .maybeSingle();
    const target = (ev as { slug?: string | null } | null)?.slug ?? detail.claimedEventId;
    permanentRedirect(`/events/${target}`);
  }

  // Only emit structured data on the indexable statuses (matches the
  // `generateMetadata` noindex guard) so hidden/removed/claimed listings don't
  // advertise rich-result signals.
  const isIndexable = detail.status === 'active' || detail.status === 'claim_pending';

  const notice = Array.isArray(searchParams['notice'])
    ? searchParams['notice'][0]
    : searchParams['notice'];

  const startsAt = detail.startsAt;
  const endsAt = detail.endsAt;
  const place = detail.location
    ? [
        detail.location.addressLine,
        detail.location.city,
        detail.location.region,
        detail.location.postalCode,
      ]
        .filter(Boolean)
        .join(', ')
    : null;
  const hostLabel = detail.externalHostName ?? externalHostFromUrl(detail.externalUrl);

  const showHiddenWarning =
    (detail.status === 'hidden' || detail.status === 'removed') && detail.canManage;

  // For the claim section: surface the viewer's upcoming hosted events so
  // they can pick one from a dropdown instead of pasting a UUID. Only load
  // when the section will actually render (logged-in, active listing, not
  // already manageable by viewer).
  // Pending-claim metadata: when the listing is in `claim_pending`, fetch
  // the proposed event title/slug and the claimant's display name so the
  // submitter/admin can review the request in-place. Single round trip;
  // skipped entirely for any other status.
  let pendingClaim: {
    eventId: string;
    eventTitle: string | null;
    eventSlug: string | null;
    claimantId: string;
    claimantName: string;
  } | null = null;
  if (detail.status === 'claim_pending' && detail.claimedEventId && detail.claimedByUserId) {
    const sb = await getServerSupabase();
    const [evRes, claimantCard] = await Promise.all([
      sb.from('events').select('id, title, slug').eq('id', detail.claimedEventId).maybeSingle(),
      new SupabaseProfileRepository(sb).findCardById(detail.claimedByUserId),
    ]);
    pendingClaim = {
      eventId: detail.claimedEventId,
      eventTitle: (evRes.data as { title?: string } | null)?.title ?? null,
      eventSlug: (evRes.data as { slug?: string | null } | null)?.slug ?? null,
      claimantId: detail.claimedByUserId,
      claimantName: claimantCard?.displayName ?? 'A host',
    };
  }

  const viewerIsClaimant =
    !!user && detail.status === 'claim_pending' && user.id === detail.claimedByUserId;

  const showClaimSection = !!user && detail.status === 'active' && !detail.canManage;
  const claimableEvents = showClaimSection
    ? await loadVisibleHostedEvents(await getServerSupabase(), user.id, {
        startsAfter: new Date(),
      })
    : [];

  // Filter to events that actually match this listing's day + city. The
  // application handler enforces the same rule server-side as a security
  // check (preventing a host from claiming arbitrary listings); the UI
  // filter is purely UX so the dropdown isn't full of mismatched options.
  const listingCityNormalized = detail.location?.city?.trim().toLowerCase() ?? null;
  const listingDayKey = listingCityNormalized
    ? formatDayKey(detail.startsAt, detail.timeZone ?? 'UTC')
    : null;
  const eligibleEvents =
    listingCityNormalized && listingDayKey
      ? claimableEvents.filter((e) => {
          if (e.city.trim().toLowerCase() !== listingCityNormalized) return false;
          const eventTz = e.time_zone ?? detail.timeZone ?? 'UTC';
          return formatDayKey(new Date(e.starts_at), eventTz) === listingDayKey;
        })
      : [];

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

      {noticeBanner(notice)}

      {pendingClaim && detail.canManage && (
        <section className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/30">
          <div className="space-y-1">
            <p className="font-semibold text-amber-900 dark:text-amber-100">
              Pending claim — review required
            </p>
            <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
              <strong>{pendingClaim.claimantName}</strong> has claimed this listing and asked to
              link it to their PickupVB event:{' '}
              {pendingClaim.eventSlug ? (
                <Link
                  href={`/events/${pendingClaim.eventSlug}` as Route}
                  className="font-medium underline"
                >
                  {pendingClaim.eventTitle ?? pendingClaim.eventId}
                </Link>
              ) : (
                <span className="font-medium">
                  {pendingClaim.eventTitle ?? pendingClaim.eventId}
                </span>
              )}
              . Approve to redirect this listing to that event, or reject to leave it as-is.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={approveListingClaimFromForm.bind(null, detail.id, detail.slug)}>
              <SubmitButton className={primaryButtonClass('sm')}>Approve claim</SubmitButton>
            </form>
            <form action={rejectListingClaimFromForm.bind(null, detail.id, detail.slug)}>
              <SubmitButton className={errorTonalButtonClass('sm')}>Reject claim</SubmitButton>
            </form>
          </div>
        </section>
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
          <LocalDateTime iso={startsAt} variant="eventDateLong" timeZone={detail.timeZone} /> at{' '}
          <LocalDateTime iso={startsAt} variant="time" timeZone={detail.timeZone} />
          {endsAt && (
            <>
              {' '}
              &ndash; <LocalDateTime iso={endsAt} variant="time" timeZone={detail.timeZone} />
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
        <section className="border-border-base bg-surface space-y-3 rounded-md border p-4 text-sm">
          <div className="space-y-1">
            <p className="font-semibold">Is this your event?</p>
            <p className="text-muted text-xs">
              If you&rsquo;re the organizer, claim this listing and link it to your PickupVB event.
              We&rsquo;ll point visitors at your event page (where they can RSVP, pay, and message
              you) instead of the external site.
            </p>
          </div>

          {eligibleEvents.length === 0 ? (
            <div className="border-border-base bg-fg/5 space-y-2 rounded-md border border-dashed p-3 text-xs">
              <p className="font-semibold">Two steps to claim this listing:</p>
              <ol className="text-muted ml-4 list-decimal space-y-1">
                <li>
                  Create the matching event on PickupVB —{' '}
                  <Link
                    href={'/events/new' as Route}
                    className="text-primary font-medium hover:underline"
                  >
                    create event
                  </Link>
                  .
                </li>
                <li>Come back to this page and pick it from the list to claim.</li>
              </ol>
              <p className="text-muted">
                {claimableEvents.length === 0
                  ? "You don't have any upcoming events on PickupVB yet, so there's nothing to link."
                  : 'None of your upcoming PickupVB events match this listing. The event you link must be on the same day and in the same city as the listing.'}
              </p>
            </div>
          ) : (
            <form
              action={claimListingFromForm.bind(null, detail.id, detail.slug)}
              className="space-y-2"
            >
              <label htmlFor="event_id" className="text-fg block text-xs font-medium">
                Pick the PickupVB event that matches this listing
              </label>
              <select
                id="event_id"
                name="event_id"
                required
                defaultValue=""
                className="border-border-base bg-surface w-full max-w-md rounded-md border px-2 py-1.5 text-sm"
              >
                <option value="" disabled>
                  Select one of your events…
                </option>
                {eligibleEvents.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} — {new Date(e.starts_at).toLocaleDateString()} · {e.city}, {e.region}
                  </option>
                ))}
              </select>
              <p className="text-muted text-xs">
                Only your events on the same day and in the same city as this listing are shown.
                Don&rsquo;t see the right one?{' '}
                <Link
                  href={'/events/new' as Route}
                  className="text-primary font-medium hover:underline"
                >
                  Create it on PickupVB
                </Link>{' '}
                first.
              </p>
              <SubmitButton className={primaryButtonClass('sm')}>Claim listing</SubmitButton>
            </form>
          )}
        </section>
      )}

      {user && !detail.canManage && detail.status === 'active' && (
        <section className="border-border-base bg-surface rounded-md border p-4 text-sm">
          <p className="font-semibold">See a problem?</p>
          <p className="text-muted mt-1">
            Report this listing if it&rsquo;s spam, broken, or shouldn&rsquo;t be here. After three
            reports it&rsquo;s automatically hidden pending review.
          </p>
          {detail.hasReported ? (
            <p className="text-muted mt-2 text-xs">You&rsquo;ve already reported this listing.</p>
          ) : (
            <form
              action={reportListingFromForm.bind(null, detail.id, detail.slug)}
              className="mt-3 space-y-2"
            >
              <select
                name="reason"
                className="border-border-base bg-surface text-fg w-full rounded-md border px-2 py-1.5 text-xs"
              >
                <option value="spam">Spam or misleading</option>
                <option value="broken_link">Broken or incorrect link</option>
                <option value="duplicate">Duplicate listing</option>
                <option value="wrong_location">Wrong location or region</option>
                <option value="other">Other</option>
              </select>
              <SubmitButton className={errorTonalButtonClass('sm')}>Report listing</SubmitButton>
            </form>
          )}
        </section>
      )}

      {detail.canManage && (
        <section className="border-border-base bg-surface space-y-3 rounded-md border p-4 text-sm">
          <p className="font-semibold">Manage listing</p>
          {detail.isPlatformAdmin && !detail.canManage && (
            <p className="text-muted text-xs">(visible to you as a platform admin)</p>
          )}
          <div className="flex flex-wrap gap-2">
            {detail.status !== 'claimed' &&
              detail.status !== 'removed' &&
              detail.status !== 'claim_pending' && (
                <Link
                  href={`/community/${detail.slug}/edit` as Route}
                  className={neutralButtonClass('sm')}
                >
                  Edit
                </Link>
              )}
            {detail.status === 'active' ? (
              <form action={hideListingFromForm.bind(null, detail.id, detail.slug)}>
                <SubmitButton className={neutralButtonClass('sm')}>Hide</SubmitButton>
              </form>
            ) : detail.status === 'hidden' ? (
              <form action={unhideListingFromForm.bind(null, detail.id, detail.slug)}>
                <SubmitButton className={neutralButtonClass('sm')}>Unhide</SubmitButton>
              </form>
            ) : null}
            <form
              action={deleteListingFromForm.bind(null, detail.id, detail.slug)}
              className="flex items-center gap-2"
            >
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" name="confirm" />
                Confirm
              </label>
              <SubmitButton className={errorTonalButtonClass('sm')}>Delete</SubmitButton>
            </form>
          </div>
          {detail.reportCount > 0 && (
            <p className="text-muted text-xs">Reports received: {detail.reportCount}</p>
          )}
        </section>
      )}
    </article>
  );
}
