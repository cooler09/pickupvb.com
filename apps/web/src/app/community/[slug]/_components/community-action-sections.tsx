'use client';

import Link from 'next/link';
import type { Route } from 'next';
import type { CommunityListingDetailReadModel } from '@pickupvb/domain';
import {
  primaryButtonClass,
  neutralButtonClass,
  errorTonalButtonClass,
} from '@/components/primary-button';
import { SubmitButton } from '@/components/submit-button';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';
import type { HostedEvent, PendingClaim } from '../_loaders/load-community-detail-page';
import {
  approveListingClaimFromForm,
  claimListingFromForm,
  deleteListingFromForm,
  hideListingFromForm,
  rejectListingClaimFromForm,
  reportListingFromForm,
  unhideListingFromForm,
} from '../listing-actions';

type Detail = CommunityListingDetailReadModel;

/** Admin/submitter review block for a `claim_pending` listing (approve/reject). */
export function PendingClaimReview({
  detail,
  pendingClaim,
}: {
  detail: Detail;
  pendingClaim: PendingClaim;
}) {
  return (
    <section className="border-md-warning/30 bg-md-warning-container space-y-3 rounded-md border p-4 text-sm">
      <div className="space-y-1">
        <p className="text-md-on-warning-container font-semibold">
          Pending claim — review required
        </p>
        <p className="text-md-on-warning-container/80 text-xs">
          <strong>{pendingClaim.claimantName}</strong> has claimed this listing and asked to link it
          to their PickupVB event:{' '}
          {pendingClaim.eventSlug ? (
            <Link
              href={`/events/${pendingClaim.eventSlug}` as Route}
              className="font-medium underline"
            >
              {pendingClaim.eventTitle ?? pendingClaim.eventId}
            </Link>
          ) : (
            <span className="font-medium">{pendingClaim.eventTitle ?? pendingClaim.eventId}</span>
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
  );
}

/** "Is this your event?" claim block — pick a matching hosted event to link. */
export function ClaimSection({
  detail,
  eligibleEvents,
  claimableEvents,
}: {
  detail: Detail;
  eligibleEvents: HostedEvent[];
  claimableEvents: HostedEvent[];
}) {
  return (
    <section className="border-border-base bg-md-surface-container space-y-3 rounded-md border p-4 text-sm">
      <div className="space-y-1">
        <p className="font-semibold">Is this your event?</p>
        <p className="text-muted text-xs">
          If you&rsquo;re the organizer, claim this listing and link it to your PickupVB event.
          We&rsquo;ll point visitors at your event page (where they can RSVP, pay, and message you)
          instead of the external site.
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
            className="border-border-base bg-md-surface-container w-full max-w-md rounded-md border px-2 py-1.5 text-sm"
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
  );
}

/** "See a problem?" report block for a logged-in non-manager on an active listing. */
export function ReportSection({ detail }: { detail: Detail }) {
  return (
    <section className="border-border-base bg-md-surface-container rounded-md border p-4 text-sm">
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
            aria-label="Reason for report"
            className="border-border-base bg-md-surface-container text-fg w-full rounded-md border px-2 py-1.5 text-xs"
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
  );
}

/** Owner/admin management block: edit / hide-unhide / delete. */
export function ManageSection({ detail }: { detail: Detail }) {
  return (
    <section className="border-border-base bg-md-surface-container space-y-3 rounded-md border p-4 text-sm">
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
        <form action={deleteListingFromForm.bind(null, detail.id, detail.slug)}>
          {/* The confirm modal is the user-facing guard; the hidden field keeps
              the server action's defensive `confirm` check satisfied. */}
          <input type="hidden" name="confirm" value="on" />
          <ConfirmSubmitButton
            label="Delete"
            pendingLabel="Deleting…"
            confirmTitle="Delete this listing?"
            confirmMessage="This permanently removes the community listing. This can't be undone."
            confirmLabel="Delete listing"
            cancelLabel="Keep listing"
            destructive
            className={errorTonalButtonClass('sm')}
          />
        </form>
      </div>
      {detail.reportCount > 0 && (
        <p className="text-muted text-xs">Reports received: {detail.reportCount}</p>
      )}
    </section>
  );
}
