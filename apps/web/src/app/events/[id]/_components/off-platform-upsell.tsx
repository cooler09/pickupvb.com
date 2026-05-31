import Link from 'next/link';
import { primaryButtonClass } from '@/components/primary-button';
import { dismissOffPlatformUpsell } from '../off-platform-upsell-actions';

/**
 * Soft, dismissible nudge shown to the host of an event whose payments are
 * configured off-platform. Pitch: switch to PickupVB-managed payments and
 * stop chasing Venmos. Audit P2 #7 — see
 * `docs/audits/monetization.md` (search "Off-platform").
 *
 * Conditions for rendering are enforced at the call site
 * ([apps/web/src/app/events/[id]/page.tsx](../page.tsx)) so this component
 * stays presentational — it expects to be rendered only when:
 *   - viewer is the event's host (`isHostOfEvent === true`)
 *   - `event.paymentsOffPlatform === true`
 *   - the dismissal cookie
 *     ([apps/web/src/lib/off-platform-upsell.ts](../../../lib/off-platform-upsell.ts))
 *     is not set
 */
export function OffPlatformUpsell({
  eventId,
  returnPath,
}: {
  eventId: string;
  returnPath: string;
}) {
  return (
    <aside
      className="border-border-base bg-fg/5 rounded-shape-sm border p-4"
      aria-label="Switch to on-platform payments"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-fg text-sm font-semibold">Tired of chasing Venmos?</p>
          <p className="text-muted text-xs">
            Switch to on-platform payments — attendees check out at signup, refunds run themselves,
            and the roster updates automatically. PickupVB takes 5% (2.5% on Pro).
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/events/${eventId}/edit`}
            className={`${primaryButtonClass()} whitespace-nowrap`}
          >
            Switch
          </Link>
          <form action={dismissOffPlatformUpsell.bind(null, returnPath)}>
            <button
              type="submit"
              className="text-muted hover:text-fg rounded px-2 py-1 text-xs"
              aria-label="Dismiss switch-to-on-platform tip"
            >
              Dismiss
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
