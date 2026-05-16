import 'server-only';
import { repositories } from './handlers';

/**
 * Resolve the host's Stripe Connect account id. Returns null if the host
 * isn't set up to receive payments yet (no row, or charges not enabled).
 *
 * Thin facade over `HostStripeAccountRepository` — callers don't need to
 * know whether the data comes from Supabase, an in-memory test double,
 * or a different payments backend.
 */
export async function getHostStripeAccount(hostId: string): Promise<string | null> {
    const account = await repositories.hostStripeAccountRepo.findByHostId(hostId);
    if (!account || !account.chargesEnabled) return null;
    return account.accountId;
}

/**
 * "Can this host accept charges right now?" — pre-flight check used by
 * event create/edit flows before flipping an event into paid mode. Returns
 * a user-facing message when the host isn't ready.
 */
export async function requireHostChargesEnabled(
    hostId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
    const accountId = await getHostStripeAccount(hostId);
    if (accountId) return { ok: true };
    return {
        ok: false,
        reason:
            'You need to finish Stripe setup at /profile/billing before charging for events.',
    };
}
