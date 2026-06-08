import { getServerSupabase } from '@/lib/supabase';
import { getViewer } from '@/lib/server-auth';
import {
  listActiveHostPasses,
  getRedeemablePassesForHost,
  type HostPass,
  type PassPurchase,
} from '@/lib/passes';
import { perSessionCents } from '@/lib/pass-helpers';
import { renderNowMs } from '@/lib/render-now';
import { SubmitButton } from '@/components/submit-button';
import { primaryButtonClass, neutralButtonClass } from '@/components/primary-button';
import { startPassPurchaseCheckout, redeemPassCredit } from '../pass-actions';

/**
 * Season-pass buy/redeem affordance on an open-play event that accepts pass
 * credits (ADR 0037). The data load is fully defensive (returns null on any
 * error) so the panel can never break the event-detail render; the JSX is
 * rendered outside the try/catch (a React error boundary, not try/catch, is
 * the right tool for render errors). Shows:
 *   - "Use a pass credit" when the viewer holds redeemable credits for the host;
 *   - otherwise the host's active passes with a "Buy pass" button.
 * Renders nothing for the host viewing their own event, or when the host sells
 * no passes / the event isn't pass-eligible.
 */

type PanelData = {
  best: PassPurchase | undefined;
  totalRemaining: number;
  activePasses: HostPass[];
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
    const [redeemable, activePasses] = await Promise.all([
      realViewer
        ? getRedeemablePassesForHost(realViewer.user.id, ev.host_id, now)
        : Promise.resolve([]),
      listActiveHostPasses(ev.host_id),
    ]);

    if (activePasses.length === 0 && redeemable.length === 0) return null;

    return {
      best: redeemable[0],
      totalRemaining: redeemable.reduce((sum, p) => sum + p.creditsRemaining, 0),
      activePasses,
    };
  } catch {
    return null;
  }
}

export async function PassPanel({ eventId }: { eventId: string }) {
  const data = await loadPassPanelData(eventId);
  if (!data) return null;
  const { best, totalRemaining, activePasses } = data;

  return (
    <section className="border-border-base bg-md-surface-container rounded-shape-sm space-y-3 border p-4">
      <h2 className="text-fg text-lg font-semibold">Season pass</h2>
      {best ? (
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
        <div className="space-y-2">
          <p className="text-muted text-sm">
            This host offers a prepaid pass — buy once, then sign up to sessions without paying each
            time.
          </p>
          <ul className="space-y-2">
            {activePasses.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">
                  <strong className="text-fg">{p.title}</strong> — {p.creditCount} sessions ·{' '}
                  {usd(p.priceCents)} ({usd(perSessionCents(p.priceCents, p.creditCount))}/session)
                </span>
                <form action={startPassPurchaseCheckout.bind(null, p.id, eventId)}>
                  <SubmitButton className={neutralButtonClass('sm')} pendingChildren="…">
                    Buy pass
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
