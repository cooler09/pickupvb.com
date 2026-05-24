import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next/types';
import { GetCommunityListingDetailQuery } from '@pickupvb/application';
import { NotFoundError } from '@pickupvb/domain';
import { SURFACE_LABEL, FORMAT_LABEL, SKILL_LABEL } from '@/lib/enum-labels';
import { LocalDateTime } from '@/components/local-datetime';
import { SubmitButton } from '@/components/submit-button';
import { handlers } from '@/lib/handlers';
import { getCurrentUser } from '@/lib/server-auth';
import { getServerSupabase } from '@/lib/supabase';
import { loadVisibleHostedEvents } from '@/components/hosted-events-list';
import { externalLinkHref } from '@/lib/external-link';
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

  // For the claim section: surface the viewer's upcoming hosted events so
  // they can pick one from a dropdown instead of pasting a UUID. Only load
  // when the section will actually render (logged-in, active listing, not
  // already manageable by viewer).
  const showClaimSection = !!user && detail.status === 'active' && !detail.canManage;
  const claimableEvents = showClaimSection
    ? await loadVisibleHostedEvents(await getServerSupabase(), user.id, {
        startsAfter: new Date(),
      })
    : [];

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

      <section className="border-primary/40 bg-primary/5 space-y-3 rounded-lg border-2 p-4">
        <p className="text-sm">
          RSVP and full details are on the external site ({hostLabel}). PickupVB doesn&rsquo;t
          handle signups for community listings.
        </p>
        <a
          href={externalLinkHref(detail.externalUrl)}
          rel="noopener noreferrer nofollow"
          className="bg-primary hover:bg-primary/90 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white"
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

          {claimableEvents.length === 0 ? (
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
                You don&rsquo;t have any upcoming events on PickupVB yet, so there&rsquo;s nothing
                to link.
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
                {claimableEvents.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} — {new Date(e.starts_at).toLocaleDateString()} · {e.city}, {e.region}
                  </option>
                ))}
              </select>
              <p className="text-muted text-xs">
                Only events you host (or co-host) are shown. Don&rsquo;t see the right one?{' '}
                <Link
                  href={'/events/new' as Route}
                  className="text-primary font-medium hover:underline"
                >
                  Create it on PickupVB
                </Link>{' '}
                first.
              </p>
              <SubmitButton className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
                Claim listing
              </SubmitButton>
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
              className="mt-3"
            >
              <SubmitButton className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:bg-red-950/30 dark:text-red-200">
                Report listing
              </SubmitButton>
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
                <SubmitButton className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
                  Hide
                </SubmitButton>
              </form>
            ) : detail.status === 'hidden' ? (
              <form action={unhideListingFromForm.bind(null, detail.id, detail.slug)}>
                <SubmitButton className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
                  Unhide
                </SubmitButton>
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
              <SubmitButton className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:bg-red-950/30 dark:text-red-200">
                Delete
              </SubmitButton>
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
