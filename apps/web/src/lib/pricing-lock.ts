import 'server-only';
import { getAdminSupabase } from './supabase-admin';

/**
 * Returns true when an event has at least one paid attendee. Once locked,
 * the edit form rejects changes to price, fee absorption, and refund window
 * so the contract that buyers paid for can't shift under them.
 */
export async function isPricingLocked(eventId: string): Promise<boolean> {
  const admin = getAdminSupabase();
  const { count, error } = await admin
    .from('event_participants')
    .select(
      'user_id, payment:event_participant_payments!inner(payment_status), division:event_divisions!inner(event_id)',
      { count: 'exact', head: true },
    )
    .eq('role', 'attendee')
    .eq('division.event_id', eventId)
    .eq('payment.payment_status', 'paid');
  if (error) return false;
  return (count ?? 0) > 0;
}
