/**
 * Community-listing claim notifications (audit CL-4).
 *
 * The claim flow moves a listing to `claim_pending` and waits for the original
 * submitter (or a platform admin) to approve/reject. Before this, the submitter
 * was never told — they only found out by revisiting the page, and an
 * admin-bulk-imported listing made the admin the silent approver for every
 * claim. These helpers close that gap:
 *
 *   - `notifyClaimPending` pings the submitter (email + bell) to review.
 *   - `notifyClaimApproved` pings the claimant (bell) that their listing now
 *     points at their event — covers both manual approval and the 7-day
 *     auto-approve cron.
 *
 * Best-effort and session-less: runs on the service-role client (the sanctioned
 * admin-client case per AGENTS.md pitfall #8) and swallows errors so a failed
 * ping never breaks the claim mutation it follows. Display names are read from
 * `profiles_public`, never base `profiles` (pitfall #13).
 */
import { createSupabaseAdminClient } from '@pickupvb/supabase';
import { notify } from '@/lib/notify';
import { log } from '@/lib/log';

/** Notify the listing's submitter that a host has filed a claim to review. */
export async function notifyClaimPending(listingId: string, claimantUserId: string): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const { data: listing } = await admin
      .from('community_listings')
      .select('slug, title, submitter_user_id')
      .eq('id', listingId)
      .maybeSingle();
    const submitterId = listing?.submitter_user_id;
    const slug = listing?.slug;
    if (!submitterId || !slug) return;
    // Don't notify yourself if the submitter is also the claiming host.
    if (submitterId === claimantUserId) return;

    const { data: claimant } = await admin
      .from('profiles_public')
      .select('display_name')
      .eq('id', claimantUserId)
      .maybeSingle();

    await notify('community.claim.pending', submitterId, {
      listingSlug: slug,
      listingTitle: listing.title,
      claimantName: claimant?.display_name ?? 'A host',
    });
  } catch (err) {
    await log.warn('[notify-community] claim-pending dispatch failed', {
      listingId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Notify the claimant that their pending claim was approved (manual or auto). */
export async function notifyClaimApproved(listingId: string): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const { data: listing } = await admin
      .from('community_listings')
      .select('slug, title, claimed_by_user_id')
      .eq('id', listingId)
      .maybeSingle();
    const claimantId = listing?.claimed_by_user_id;
    const slug = listing?.slug;
    if (!claimantId || !slug) return;

    await notify('community.claim.approved', claimantId, {
      listingSlug: slug,
      listingTitle: listing.title,
    });
  } catch (err) {
    await log.warn('[notify-community] claim-approved dispatch failed', {
      listingId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
