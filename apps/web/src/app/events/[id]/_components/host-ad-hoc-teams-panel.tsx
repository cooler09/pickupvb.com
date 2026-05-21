import { SubmitButton } from '@/components/submit-button';
import {
  hostForceWithdrawTeamRegistration,
  hostMarkTeamRegistrationPaid,
  hostRefundTeamRegistration,
} from '../host-team-registration-actions';

/**
 * Host-facing row for the ad-hoc team management panel. Built from the
 * page's side-load — captain display name comes from a `profiles` join.
 */
export type HostAdHocTeamRow = {
  id: string;
  name: string;
  divisionId: string;
  paymentStatus: 'none' | 'pending' | 'paid' | 'refunded';
  paymentIntentId: string | null;
  amountPaidCents: number;
  rosterSize: number;
  captain: {
    id: string;
    displayName: string | null;
  } | null;
};

type DivisionLabel = {
  id: string;
  label: string;
};

type Props = {
  eventId: string;
  returnPath: string;
  divisions: ReadonlyArray<DivisionLabel>;
  rows: ReadonlyArray<HostAdHocTeamRow>;
};

const PAYMENT_PILL: Record<HostAdHocTeamRow['paymentStatus'], { label: string; cls: string }> = {
  none: { label: 'Unpaid', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  pending: { label: 'Pending', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  paid: { label: 'Paid', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  refunded: { label: 'Refunded', cls: 'border-border-base bg-fg/5 text-muted' },
};

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function divisionLabel(divisions: ReadonlyArray<DivisionLabel>, id: string): string {
  return divisions.find((d) => d.id === id)?.label ?? 'Division';
}

/**
 * Host management table for ad-hoc team registrations (ADR 0007).
 *
 * Shown inside the "Host tools" details on the event page when the event
 * is in `ad_hoc` team mode. Lets the host:
 *   - Mark a team paid (off-platform cash / Venmo)
 *   - Refund a paid team (Stripe call when applicable; otherwise just a
 *     state flip for off-platform receipts)
 *   - Force-withdraw an unpaid or already-refunded team
 *
 * All actions are bound via `.bind()` and posted as plain forms so the
 * action can `revalidatePath` + `redirect` with a flash code.
 */
export function HostAdHocTeamsPanel({ eventId, returnPath, divisions, rows }: Props) {
  return (
    <section className="border-border-base bg-fg/[0.02] space-y-3 rounded-lg border p-4">
      <header>
        <h3 className="text-fg text-sm font-semibold">Team registrations</h3>
        <p className="text-muted text-xs">
          Mark off-platform payments, refund Stripe payments, or remove unpaid teams.
        </p>
      </header>
      {rows.length === 0 ? (
        <p className="text-muted text-xs">No teams have registered yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const pill = PAYMENT_PILL[r.paymentStatus];
            const isPaid = r.paymentStatus === 'paid';
            const isRefunded = r.paymentStatus === 'refunded';
            const isStripe = !!r.paymentIntentId && !r.paymentIntentId.startsWith('offline:');
            const canMarkPaid = r.paymentStatus === 'none' || r.paymentStatus === 'pending';
            const canRefund = isPaid;
            const canForceWithdraw = r.paymentStatus === 'none' || isRefunded;
            return (
              <li
                key={r.id}
                className="border-border-base bg-surface space-y-2 rounded-md border p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-fg truncate text-sm font-semibold">{r.name}</p>
                    <p className="text-muted text-xs">
                      {divisionLabel(divisions, r.divisionId)} · {r.rosterSize} player
                      {r.rosterSize === 1 ? '' : 's'} · Captain:{' '}
                      {r.captain?.displayName ?? 'Unknown'}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium ${pill.cls}`}
                  >
                    {pill.label}
                    {isPaid && r.amountPaidCents > 0
                      ? ` · ${formatUsd(r.amountPaidCents)}${isStripe ? ' (Stripe)' : ' (off-platform)'}`
                      : ''}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {canMarkPaid && (
                    <form
                      action={hostMarkTeamRegistrationPaid.bind(null, eventId, r.id, returnPath)}
                    >
                      <SubmitButton className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1 text-xs font-medium disabled:opacity-50">
                        Mark paid (off-platform)
                      </SubmitButton>
                    </form>
                  )}
                  {canRefund && (
                    <form action={hostRefundTeamRegistration.bind(null, eventId, r.id, returnPath)}>
                      <SubmitButton className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1 text-xs font-medium disabled:opacity-50">
                        {isStripe ? 'Refund via Stripe' : 'Mark refunded'}
                      </SubmitButton>
                    </form>
                  )}
                  {canForceWithdraw && (
                    <form
                      action={hostForceWithdrawTeamRegistration.bind(
                        null,
                        eventId,
                        r.id,
                        returnPath,
                      )}
                    >
                      <SubmitButton className="rounded-md border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
                        Remove team
                      </SubmitButton>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
