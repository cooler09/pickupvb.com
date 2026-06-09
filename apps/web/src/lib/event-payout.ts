import 'server-only';
import { getAdminSupabase } from './supabase-admin';
import { getGroupStripeAccount } from './group-stripe-account';
import { getHostStripeAccount } from './host-stripe-account';

/**
 * Resolve the Stripe Connect account an event's **per-event** charges
 * (ticket / team / tip) pay out to (ADR 0038).
 *
 * - If the event opted into group payout (`events.payout_group_id` set), the
 *   destination is the GROUP's Connect account. **If that account isn't
 *   charges-enabled we return `null` — we do NOT fall back to the host.** The
 *   event was advertised as paying the club; silently routing to the host's
 *   personal account would misroute the money. Returning null surfaces the
 *   usual "host isn't ready to take payments" state instead.
 * - Otherwise the destination is the host user's account (today's behavior,
 *   byte-for-byte, for every non-opted and pre-existing event).
 *
 * The platform `application_fee` is unchanged — it still keys on the host user's
 * tier (`events.host_id`); Club changes only WHERE the payout lands, not the fee.
 * Passes / memberships are host-user products and do not use this resolver.
 */
export async function getEventPayoutAccount(
  eventId: string,
  hostId: string,
): Promise<string | null> {
  const { data } = await getAdminSupabase()
    .from('events')
    .select('payout_group_id')
    .eq('id', eventId)
    .maybeSingle();
  const groupId = (data as { payout_group_id: string | null } | null)?.payout_group_id ?? null;

  if (groupId) {
    // No host fallback by design — see the doc comment above.
    return getGroupStripeAccount(groupId);
  }
  return getHostStripeAccount(hostId);
}
