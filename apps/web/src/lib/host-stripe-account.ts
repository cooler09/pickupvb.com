import 'server-only';
import type { HostStripeAccount, HostStripeAccountStatus } from '@pickupvb/domain';
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
 * Full mirrored Stripe account state for the host — used by the billing
 * page to render onboarding progress (charges_enabled, payouts_enabled,
 * details_submitted).
 */
export async function getHostStripeAccountStatus(
  hostId: string,
): Promise<HostStripeAccount | null> {
  return repositories.hostStripeAccountRepo.findByHostId(hostId);
}

export async function createHostStripeAccount(account: HostStripeAccount): Promise<void> {
  await repositories.hostStripeAccountRepo.create(account);
}

export async function updateHostStripeAccountStatus(
  hostId: string,
  status: HostStripeAccountStatus,
): Promise<void> {
  await repositories.hostStripeAccountRepo.updateStatusByHostId(hostId, status);
}

export async function mirrorStripeAccountUpdate(
  accountId: string,
  status: HostStripeAccountStatus,
): Promise<boolean> {
  return repositories.hostStripeAccountRepo.updateStatusByAccountId(accountId, status);
}

/** Billing page where a host completes Stripe Connect onboarding. */
export const HOST_BILLING_PATH = '/profile/billing';

/**
 * A "fix this" link the UI can render next to an error message so the
 * viewer can resolve the blocker in one click (e.g. finish Stripe setup).
 * Serialized into form-action state, so it stays a plain `{ href, label }`.
 */
export interface ErrorActionLink {
  href: string;
  label: string;
}

/**
 * "Can this host accept charges right now?" — pre-flight check used by
 * event create/edit flows before flipping an event into paid mode. Returns
 * a user-facing message — plus a `cta` link to the billing page so the form
 * can offer a one-click path to finish setup — when the host isn't ready.
 */
export async function requireHostChargesEnabled(
  hostId: string,
): Promise<{ ok: true } | { ok: false; reason: string; cta: ErrorActionLink }> {
  const accountId = await getHostStripeAccount(hostId);
  if (accountId) return { ok: true };
  return {
    ok: false,
    reason: 'You need to finish Stripe setup before you can charge for events.',
    cta: { href: HOST_BILLING_PATH, label: 'Go to billing →' },
  };
}
