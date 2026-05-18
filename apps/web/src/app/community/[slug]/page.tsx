import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next/types';
import { GetCommunityListingDetailQuery } from '@pickupvb/application';
import { NotFoundError } from '@pickupvb/domain';
import { SURFACE_LABEL, FORMAT_LABEL, SKILL_LABEL } from '@/lib/enum-labels';
import { formatEventDateLong, formatTime } from '@/lib/date-formats';
import { handlers } from '@/lib/handlers';
import { getCurrentUser } from '@/lib/server-auth';
import {
  claimListingFromForm,
  deleteListingFromForm,
  hideListingFromForm,
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
  const detail = await loadDetail(slug, null);
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
    robots: detail.status === 'active' ? undefined : { index: false, follow: false },
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
    claimfail: {
      tone: 'err',
      text: "That event couldn't be linked. You can only claim a listing with an event you host on PickupVB.",
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
    <div role="status" className={`rounded-md border p-3 text-sm ${toneClass}`}>
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

export default async function CommunityListingDetailPage(props: PageProps) {
  const { slug } = await props.params;
  const searchParams = await props.searchParams;
  const { user } = await getCurrentUser();
  const detail = await loadDetail(slug, user?.id ?? null);
  if (!detail) notFound();

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

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <nav className="text-muted text-sm">
        <Link href="/community" className="hover:text-primary">
          ← All community listings
        </Link>
      </nav>

      {noticeBanner(notice)}

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

      <div className="border-border-base bg-surface space-y-1 rounded-lg border p-4">
        <p className="text-fg text-sm font-semibold">When</p>
        <p className="text-sm">
          {formatEventDateLong(startsAt)} at {formatTime(startsAt)}
          {endsAt && <> &ndash; {formatTime(endsAt)}</>}
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

      <section className="border-primary/40 bg-primary/5 space-y-3 rounded-lg border-2 p-4">
        <p className="text-sm">
          RSVP and full details are on the external site ({hostLabel}). PickupVB doesn&rsquo;t
          handle signups for community listings.
        </p>
        <a
          href={detail.externalUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="bg-primary hover:bg-primary/90 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white"
        >
          Open on {hostLabel} →
        </a>
        <p className="text-muted text-xs break-all">{detail.externalUrl}</p>
      </section>

      {user && detail.status === 'active' && !detail.canManage && (
        <section className="border-border-base bg-surface space-y-3 rounded-md border p-4 text-sm">
          <p className="font-semibold">Host this event on PickupVB?</p>
          <p className="text-muted text-xs">
            If you&rsquo;re the organizer and you&rsquo;ve already created the matching event on
            PickupVB, link it here. We&rsquo;ll mark this listing as claimed and point everyone at
            your event page. You can only claim a listing with an event you host.
          </p>
          <form
            action={claimListingFromForm.bind(null, detail.id, detail.slug)}
            className="flex flex-wrap items-center gap-2"
          >
            <label htmlFor="event_id" className="sr-only">
              Your event ID
            </label>
            <input
              id="event_id"
              name="event_id"
              required
              placeholder="Your event UUID"
              className="border-border-base bg-surface w-72 max-w-full rounded-md border px-2 py-1 font-mono text-xs"
            />
            <button
              type="submit"
              className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 rounded-md border px-3 py-1.5 text-xs font-semibold"
            >
              Claim listing
            </button>
          </form>
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
              className="mt-3"
            >
              <button
                type="submit"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-200"
              >
                Report listing
              </button>
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
            {detail.status !== 'claimed' && detail.status !== 'removed' && (
              <Link
                href={`/community/${detail.slug}/edit` as Route}
                className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1.5 text-xs font-semibold"
              >
                Edit
              </Link>
            )}
            {detail.status === 'active' ? (
              <form action={hideListingFromForm.bind(null, detail.id, detail.slug)}>
                <button
                  type="submit"
                  className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1.5 text-xs font-semibold"
                >
                  Hide
                </button>
              </form>
            ) : detail.status === 'hidden' ? (
              <form action={unhideListingFromForm.bind(null, detail.id, detail.slug)}>
                <button
                  type="submit"
                  className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1.5 text-xs font-semibold"
                >
                  Unhide
                </button>
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
              <button
                type="submit"
                className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-200"
              >
                Delete
              </button>
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
