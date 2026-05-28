import { CloseOnSettled, FormModal, ModalFooter } from '@/components/form-modal';
import { SubmitButton } from '@/components/submit-button';
import {
  hostForceWithdrawTeamRegistration,
  hostMarkTeamRegistrationPaid,
  hostRefundTeamRegistration,
} from '../host-team-registration-actions';
import { markWalkInPaidCashFromForm, registerWalkInTeamFromForm } from '../walk-in-team-actions';

/**
 * Host-facing row for the ad-hoc team management panel. Built from the
 * page's side-load — captain display name comes from a `profiles` join.
 */
export type HostAdHocTeamRowMember = {
  id: string;
  userId: string | null;
  displayName: string;
  email: string | null;
};

export type HostAdHocTeamRow = {
  id: string;
  name: string;
  divisionId: string;
  paymentStatus: 'none' | 'pending' | 'paid' | 'refunded';
  paymentIntentId: string | null;
  amountPaidCents: number;
  rosterSize: number;
  /** Who created this registration — ADR 0017. */
  source: 'ad_hoc' | 'walk_in';
  /** Phone for walk-in captains (null for captain/host sources). */
  captainPhone: string | null;
  /** Freeform note attached when the host marked a walk-in paid in cash. */
  paymentNote: string | null;
  captain: {
    id: string | null;
    displayName: string | null;
  } | null;
  /** Roster excluding the captain, sorted by `sort_order`. */
  members: ReadonlyArray<HostAdHocTeamRowMember>;
};

type DivisionLabel = {
  id: string;
  label: string;
  /** Only ad-hoc divisions accept walk-ins (ADR 0017). */
  isAdHoc: boolean;
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
  const adHocDivisions = divisions.filter((d) => d.isAdHoc);
  return (
    <section className="border-border-base bg-fg/[0.02] space-y-3 rounded-lg border p-4">
      <header>
        <h3 className="text-fg text-sm font-semibold">Team registrations</h3>
        <p className="text-muted text-xs">
          Mark off-platform payments, refund Stripe payments, remove unpaid teams, or add a walk-in
          team that signed up the day of.
        </p>
      </header>

      {adHocDivisions.length > 0 && (
        <FormModal
          trigger={(open) => (
            <button
              type="button"
              onClick={open}
              className="bg-primary text-primary-fg inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-semibold shadow-sm hover:opacity-90"
            >
              + Add walk-in team
            </button>
          )}
          title="Add walk-in team"
          description="Register a team that signed up the day of. Captain and additional roster are optional — you can edit later."
          size="lg"
        >
          {(close) => (
            <form
              action={registerWalkInTeamFromForm.bind(null, eventId, returnPath)}
              className="space-y-3 text-sm"
            >
              <CloseOnSettled onSettled={close} />
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-muted text-xs font-medium">Division</span>
                  <select
                    name="division_id"
                    required
                    className="border-border-base bg-surface rounded-md border px-2 py-1 text-sm"
                  >
                    {adHocDivisions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-muted text-xs font-medium">Team name</span>
                  <input
                    name="team_name"
                    required
                    maxLength={120}
                    className="border-border-base bg-surface rounded-md border px-2 py-1 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-muted text-xs font-medium">Captain name</span>
                  <input
                    name="captain_display_name"
                    required
                    maxLength={80}
                    className="border-border-base bg-surface rounded-md border px-2 py-1 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-muted text-xs font-medium">Captain phone (optional)</span>
                  <input
                    name="captain_phone"
                    maxLength={40}
                    inputMode="tel"
                    className="border-border-base bg-surface rounded-md border px-2 py-1 text-sm"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-muted text-xs font-medium">
                  Additional players (one per line, optional)
                </span>
                <textarea
                  name="members"
                  rows={3}
                  className="border-border-base bg-surface rounded-md border px-2 py-1 text-sm"
                />
              </label>
              <ModalFooter>
                <button
                  type="button"
                  onClick={close}
                  className="border-border-base text-fg/80 hover:bg-fg/5 rounded-md border px-3 py-1.5 text-sm"
                >
                  Cancel
                </button>
                <SubmitButton
                  pendingChildren="Adding…"
                  className="bg-primary text-primary-fg rounded-md px-3 py-1.5 text-sm font-semibold shadow-sm hover:opacity-90 disabled:opacity-60"
                >
                  Add walk-in team
                </SubmitButton>
              </ModalFooter>
            </form>
          )}
        </FormModal>
      )}
      {rows.length === 0 ? (
        <p className="text-muted text-xs">No teams have registered yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const pill = PAYMENT_PILL[r.paymentStatus];
            const isPaid = r.paymentStatus === 'paid';
            const isRefunded = r.paymentStatus === 'refunded';
            const isStripe = !!r.paymentIntentId && !r.paymentIntentId.startsWith('offline:');
            const isWalkIn = r.source === 'walk_in';
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
                    {isWalkIn && r.captainPhone && (
                      <p className="text-muted text-xs">Phone: {r.captainPhone}</p>
                    )}
                    {isPaid && r.paymentNote && (
                      <p className="text-muted text-xs italic">Note: {r.paymentNote}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    {isWalkIn && (
                      <span className="rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800">
                        Walk-in
                      </span>
                    )}
                    <span
                      className={`rounded-md border px-2 py-0.5 text-xs font-medium ${pill.cls}`}
                    >
                      {pill.label}
                      {isPaid && r.amountPaidCents > 0
                        ? ` · ${formatUsd(r.amountPaidCents)}${isStripe ? ' (Stripe)' : isWalkIn ? ' (cash)' : ' (off-platform)'}`
                        : ''}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {canMarkPaid && !isWalkIn && (
                    <form
                      action={hostMarkTeamRegistrationPaid.bind(null, eventId, r.id, returnPath)}
                    >
                      <SubmitButton className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1 text-xs font-medium disabled:opacity-50">
                        Mark paid (off-platform)
                      </SubmitButton>
                    </form>
                  )}
                  {canMarkPaid && isWalkIn && (
                    <form
                      action={markWalkInPaidCashFromForm.bind(null, eventId, r.id, returnPath)}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <input
                        type="text"
                        name="note"
                        placeholder="Cash note (optional)"
                        maxLength={500}
                        className="border-border-base bg-surface rounded-md border px-2 py-1 text-xs"
                      />
                      <SubmitButton className="border-border-base hover:bg-fg/5 rounded-md border px-3 py-1 text-xs font-medium disabled:opacity-50">
                        Mark paid (cash)
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

                <details className="group">
                  <summary className="text-muted hover:text-fg cursor-pointer text-xs font-medium select-none">
                    <span className="group-open:hidden">Show roster ({r.rosterSize})</span>
                    <span className="hidden group-open:inline">Hide roster</span>
                  </summary>
                  <ul className="border-border-base mt-2 space-y-1 border-l pl-3 text-sm">
                    <li className="text-fg flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{r.captain?.displayName ?? 'Captain'}</span>
                      <span className="text-muted text-xs">(captain)</span>
                    </li>
                    {r.members.map((m) => (
                      <li key={m.id} className="text-fg flex flex-wrap items-baseline gap-x-2">
                        <span className="truncate">{m.displayName}</span>
                        {m.email && m.email !== m.displayName && (
                          <span className="text-muted truncate text-xs">{m.email}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
