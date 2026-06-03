import 'server-only';
import { FREE_PAID_EVENT_CAP_30D, hostPaidEventCount30d } from './pro';
import { hasProBenefits } from './admin';

const CAP_MESSAGE =
  `Free hosts can run ${FREE_PAID_EVENT_CAP_30D} paid event per 30 days. ` +
  `Upgrade to Pro for unlimited paid events.`;

/** One-click upgrade path rendered next to the cap message (see ErrorActionLink). */
const PRO_UPGRADE_CTA: { href: string; label: string } = {
  href: '/profile/billing/pro',
  label: 'Upgrade to Pro →',
};

/**
 * Result of a paid-event-cap check. `ok: false` means the action should
 * surface `reason` back to the user — plus `cta`, a link to the upgrade
 * page so the form can offer a one-click path out — and roll back any side
 * effects.
 */
export type PaidEventCapResult =
  | { ok: true }
  | { ok: false; reason: string; cta: { href: string; label: string } };

/**
 * Enforce the free-tier "1 paid event per 30 days" cap.
 *
 * Two callers, two semantics:
 *   - **before** the paid event exists (edit/actions flipping free→paid):
 *     pass `includesCurrentEvent: false` so `count >= CAP` blocks.
 *   - **after** insert (new/actions, where the count already includes the
 *     just-created row): pass `includesCurrentEvent: true` so `count > CAP`
 *     blocks (i.e. CAP itself is the allowed value).
 */
export async function validateHostPaidEventCap(
  hostId: string,
  opts: { includesCurrentEvent: boolean },
): Promise<PaidEventCapResult> {
  if (await hasProBenefits(hostId)) return { ok: true };
  const count = await hostPaidEventCount30d(hostId);
  const limit = opts.includesCurrentEvent ? FREE_PAID_EVENT_CAP_30D : FREE_PAID_EVENT_CAP_30D - 1;
  if (count > limit) return { ok: false, reason: CAP_MESSAGE, cta: PRO_UPGRADE_CTA };
  return { ok: true };
}
