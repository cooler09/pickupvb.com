import type { CommunityListingDetailReadModel } from '@pickupvb/domain';
import { primaryButtonClass } from '@/components/primary-button';
import { LocalDateTime } from '@/components/local-datetime';
import { externalLinkHref } from '@/lib/external-link';
import { SURFACE_LABEL, FORMAT_LABEL, SKILL_LABEL } from '@/lib/enum-labels';

/** Bare external host (e.g. `facebook.com`) from a URL, for the outbound CTA. */
function externalHostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * The viewer-independent body of a community listing — eyebrow, title,
 * submitter, the When/Where card, description, and the outbound-link CTA.
 *
 * Pure presentational (no hooks, no server-only imports) so it renders in both
 * environments: the **server** shell renders it for publicly-visible listings
 * (active / claim_pending) to keep the page ISR-cacheable and indexable, and the
 * **client** `CommunityRestrictedView` renders the same markup from the
 * viewer-scoped read for a manager viewing their hidden/removed listing.
 */
export function CommunityListingArticle({ detail }: { detail: CommunityListingDetailReadModel }) {
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

  return (
    <>
      <header className="space-y-2">
        <p className="text-md-warning text-xs font-semibold tracking-wide uppercase">
          Community listing
        </p>
        <h1 className="text-headline-lg font-bold">{detail.title}</h1>
        <p className="text-muted text-sm">Submitted by {detail.submitter.displayName}</p>
      </header>

      <div className="border-border-base bg-md-surface-container rounded-shape-sm space-y-1 border p-4">
        <p className="text-fg text-sm font-semibold">When</p>
        <p className="text-sm">
          {detail.allDay ? (
            <>
              <LocalDateTime
                iso={detail.startsAt}
                variant="eventDayLong"
                timeZone={detail.timeZone}
              />
              <span className="text-muted"> · time TBD</span>
            </>
          ) : (
            <>
              <LocalDateTime
                iso={detail.startsAt}
                variant="eventDateLong"
                timeZone={detail.timeZone}
              />{' '}
              at <LocalDateTime iso={detail.startsAt} variant="time" timeZone={detail.timeZone} />
              {detail.endsAt && (
                <>
                  {' '}
                  &ndash;{' '}
                  <LocalDateTime iso={detail.endsAt} variant="time" timeZone={detail.timeZone} />
                </>
              )}
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
        {/* `ugc` marks this as a user-submitted destination (Google's UGC-link
            attribute); `nofollow` keeps us from vouching for an unverified
            external site. The crawlable source association is carried by the
            SportsEvent JSON-LD `sameAs`, not by this hyperlink. */}
        <a
          href={externalLinkHref(detail.externalUrl)}
          target="_blank"
          rel="noopener noreferrer nofollow ugc"
          className={`${primaryButtonClass('md')} gap-2`}
        >
          Open on {hostLabel} →<span className="sr-only"> (opens in new tab)</span>
        </a>
        <p className="text-muted text-xs break-all">{detail.externalUrl}</p>
      </section>
    </>
  );
}
