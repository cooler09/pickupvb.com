import { getServerSupabase } from '@/lib/supabase';
import { getViewer } from '@/lib/server-auth';
import {
  listActiveHostPasses,
  getRedeemablePassesForHost,
  type HostPass,
  type PassPurchase,
} from '@/lib/passes';
import {
  listActiveMembershipPlans,
  getActiveMembershipForHost,
  type MembershipPlan,
} from '@/lib/memberships';
import { perSessionCents } from '@/lib/pass-helpers';
import { renderNowMs } from '@/lib/render-now';
import { SubmitButton } from '@/components/submit-button';
import { primaryButtonClass, neutralButtonClass } from '@/components/primary-button';
import { startPassPurchaseCheckout, redeemPassCredit } from '../pass-actions';
import { startMembershipCheckout, claimMembershipSpot } from '../membership-actions';

/**
 * Pass + membership buy/redeem affordance on an open-play event that accepts
 * pass credits (ADR 0037 + Phase 2 memberships). Fully defensive data load
 * (returns null on any error) so it can never break event-detail; JSX renders
 * outside the try/catch. Precedence:
 *   1. active member → "claim your spot" (free, unlimited);
 *   2. else redeemable pass credits → "use a credit";
 *   3. else offer to buy → membership plans + pass packs.
 * Renders nothing for the host viewing their own event, or when the host sells
 * neither and the viewer holds neither.
 */

type PanelData = {
  isMember: boolean;
  best: PassPurchase | undefined;
  totalRemaining: number;
  activePasses: HostPass[];
  membershipPlans: MembershipPlan[];
};

function usd(cents: number): string {
  return (cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

async function loadPassPanelData(eventId: string): Promise<PanelData | null> {
  try {
    const sb = await getServerSupabase();
    const { data } = await sb
      .from('events')
      .select('host_id, type, accepts_pass_credits')
      .eq('id', eventId)
      .maybeSingle();
    const ev = data as { host_id: string; type: string; accepts_pass_credits: boolean } | null;
    if (!ev || ev.type !== 'open_play' || !ev.accepts_pass_credits) return null;

    const viewer = await getViewer();
    const realViewer = viewer && !viewer.isAnonymous ? viewer : null;
    if (realViewer?.user.id === ev.host_id) return null;

    const now = renderNowMs();
    const [redeemable, activePasses, membershipPlans, activeMembership] = await Promise.all([
      realViewer
        ? getRedeemablePassesForHost(realViewer.user.id, ev.host_id, now)
        : Promise.resolve([]),
      listActiveHostPasses(ev.host_id),
      listActiveMembershipPlans(ev.host_id),
      realViewer
        ? getActiveMembershipForHost(realViewer.user.id, ev.host_id, now)
        : Promise.resolve(null),
    ]);

    if (
      !activeMembership &&
      redeemable.length === 0 &&
      activePasses.length === 0 &&
      membershipPlans.length === 0
    ) {
      return null;
    }

    return {
      isMember: Boolean(activeMembership),
      best: redeemable[0],
      totalRemaining: redeemable.reduce((sum, p) => sum + p.creditsRemaining, 0),
      activePasses,
      membershipPlans,
    };
  } catch {
    return null;
  }
}

export async function PassPanel({ eventId }: { eventId: string }) {
  const data = await loadPassPanelData(eventId);
  if (!data) return null;
  const { isMember, best, totalRemaining, activePasses, membershipPlans } = data;

  return (
    <section className="border-border-base bg-md-surface-container rounded-shape-sm space-y-3 border p-4">
      <h2 className="text-fg text-lg font-semibold">Passes &amp; membership</h2>

      {isMember ? (
        <form action={claimMembershipSpot.bind(null, eventId)} className="space-y-2">
          <p className="text-muted text-sm">
            You&apos;re a <strong className="text-fg">member</strong> of this host. Claim your spot
            — no charge.
          </p>
          <SubmitButton className={primaryButtonClass('md')} pendingChildren="Claiming…">
            Claim your spot
          </SubmitButton>
        </form>
      ) : best ? (
        <form action={redeemPassCredit.bind(null, best.id, eventId)} className="space-y-2">
          <p className="text-muted text-sm">
            You have{' '}
            <strong className="text-fg">
              {totalRemaining} credit{totalRemaining === 1 ? '' : 's'}
            </strong>{' '}
            with this host. Use one to claim your spot — no charge.
          </p>
          <SubmitButton className={primaryButtonClass('md')} pendingChildren="Redeeming…">
            Use a pass credit
          </SubmitButton>
        </form>
      ) : (
        <div className="space-y-3">
          <p className="text-muted text-sm">
            This host offers prepaid options — sign up to sessions without paying each time.
          </p>

          {membershipPlans.length > 0 && (
            <ul className="space-y-2">
              {membershipPlans.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">
                    <strong className="text-fg">{p.title}</strong> — {usd(p.priceCents)}/month,
                    unlimited sessions while active
                  </span>
                  <form action={startMembershipCheckout.bind(null, p.id, eventId)}>
                    <SubmitButton className={primaryButtonClass('sm')} pendingChildren="…">
                      Become a member
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}

          {activePasses.length > 0 && (
            <ul className="space-y-2">
              {activePasses.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">
                    <strong className="text-fg">{p.title}</strong> — {p.creditCount} sessions ·{' '}
                    {usd(p.priceCents)} ({usd(perSessionCents(p.priceCents, p.creditCount))}
                    /session)
                  </span>
                  <form action={startPassPurchaseCheckout.bind(null, p.id, eventId)}>
                    <SubmitButton className={neutralButtonClass('sm')} pendingChildren="…">
                      Buy pass
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
